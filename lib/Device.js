'use strict';

const { OAuth2Device } = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device deleted
  async onOAuth2Deleted() {
    // Stop polling
    await this.driver.stopPolling();

    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Migrate device
    await this.migrate();

    // Register capability listeners
    await this.registerCapabilityListeners();

    // Enable polling
    await this.driver.enablePolling();

    this.log('Initialized');

    // Synchronize device
    await this.sync();
  }

  /*
  | Synchronization functions
  */

  async sync() {
    try {
      const { id } = this.getData();
      const result = await this.oAuth2Client.getDevice(id);

      await this.handleSyncData(result);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  async registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('operating_mode', this.onCapabilityOperatingMode.bind(this));
    this.registerCapabilityListener('settable_mode', this.onCapabilitySettableMode.bind(this));
  }

  /*
  | Support functions
  */

  // Migrate device
  async migrate() {
    // Add 'connected' capability
    if (!this.hasCapability('connected')) {
      this.addCapability('connected').catch(this.error);
    }
  }

}

module.exports = Device;
