'use strict';

const {OAuth2Device} = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  // Device deleted
  async onOAuth2Added() {
    this.log('Device added (oAuth2)');
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Device deleted (oAuth2)');

    this.cleanup();

    await this.homey.app.stopNotifications();
  }

  // Device initialized
  async onOAuth2Init() {
    this.log('Device initialized (oAuth2)');

    this.nventId = this.getData().id;

    // Make sure the connected capability is added
    if (!this.hasCapability('connected')) {
      await this.addCapability('connected');
    }

    // Register listeners
    await this.registerCapabilityListeners();
    await this.registerEventListeners();

    // Start app timers
    await this.homey.app.startTimers();

    // Refresh device
    await this.homey.app.client.syncDevice(this.nventId);
  }

  // Device saved
  async onOAuth2Saved() {
    this.log('Device saved (oAuth2)');
  }

  // Device uninitialized.
  async onOAuth2Uninit() {
    this.log('Device uninitialized (oAuth2)');

    this.cleanup();
  }

  /*
  |-----------------------------------------------------------------------------
  | Device update functions
  |-----------------------------------------------------------------------------
  */

  // Set device data
  async setDeviceData(data) {
    if (data.serialNumber !== this.nventId) {
      return;
    }

    try {
      await this.setCapabilities(data);
      await this.setAvailability(data);
    } catch (err) {
      this.error('Update failed:', err);
      await this.setUnavailable(err.message);
    }
  }

  // Set device availability
  async setAvailability(data) {
    // Offline
    if (data.hasOwnProperty('online') && !data.online) {
      return this.setUnavailable(this.homey.__('offline'));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  // Cleanup device data / listeners
  cleanup() {
    this.log('Cleanup device data');

    // Remove event listeners for device
    this.homey.removeListener('nvent:error', this.onError);
    this.homey.removeListener('nvent:sync', this.onSync);
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
