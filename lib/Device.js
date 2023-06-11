'use strict';

const { OAuth2Device } = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Migrate device
    await this.migrate();

    // Register capability listeners
    await this.registerCapabilityListeners();

    // Synchronize device
    await this.sync();

    this.log('Initialized');

    // Register services
    await this.homey.app.registerServices();
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync() {
    let result;

    try {
      this.log('[Sync] Get device from API');

      const { id } = this.getData();
      result = await this.oAuth2Client.getDevice(id);

      await this.handleSyncData(result);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      result = null;
    }
  }

  // Handle sync data
  async handleSyncData(data) {
    this.log('[Sync]', JSON.stringify(data));

    try {
      await this.setCapabilities(data);
      await this.setAvailability(data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('[Sync]', err.message);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      data = null;
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

      this.log('Capability `connected` added');
    }
  }

}

module.exports = Device;
