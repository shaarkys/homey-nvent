'use strict';

const {OAuth2Device} = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  // Device added
  async onOAuth2Added() {
    this.log('Device added (oAuth2)');

    // Start timer and notifications
    await this.homey.app.startAll();
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Device deleted (oAuth2)');

    await this.cleanup();

    await this.homey.app.stopAll();
  }

  // Device initialized
  async onOAuth2Init() {
    this.log('Device initialized (oAuth2)');

    this.setUnavailable().catch(this.error);

    // Make sure the connected capability is added
    if (!this.hasCapability('connected')) {
      this.addCapability('connected').catch(this.error);
    }

    // Wait for driver to become ready
    await this.driver.ready();

    // Register listeners
    await this.registerCapabilityListeners();
    await this.registerEventListeners();

    // Set device state
    const {id} = this.getData();
    await this.oAuth2Client.syncDevice(id);

    // Start timer and notifications
    await this.homey.app.startAll();
  }

  /*
  |-----------------------------------------------------------------------------
  | Device update functions
  |-----------------------------------------------------------------------------
  */

  // Set device data
  setDeviceData(data) {
    const {id} = this.getData();

    if (data.serialNumber !== id) {
      return;
    }

    Promise.resolve().then(async () => {
      await this.setCapabilities(data);
      await this.setAvailability(data);
    }).catch(err => {
      this.error('Update failed:', err);
      this.setUnavailable(err.message).catch(this.error);
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  // Cleanup device data / listeners
  async cleanup() {
    this.log('Cleanup device data');

    // Remove event listeners for device
    this.homey.off('nvent:error', this.onError);
    this.homey.off('nvent:sync', this.onSync);
  }

  // Register capability listeners
  async registerCapabilityListeners() {
    if (this.hasCapability('target_temperature')) {
      this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    }

    if (this.hasCapability('operating_mode')) {
      this.registerCapabilityListener('operating_mode', this.onCapabilityOperatingMode.bind(this));
    }

    if (this.hasCapability('settable_mode')) {
      this.registerCapabilityListener('settable_mode', this.onCapabilitySettableMode.bind(this));
    }
  }

  // Register event listeners.
  async registerEventListeners() {
    this.onSync = this.setDeviceData.bind(this);
    this.onError = this.setUnavailable.bind(this);

    this.homey.on('nvent:error', this.onError);
    this.homey.on('nvent:sync', this.onSync);
  }

}

module.exports = Device;
