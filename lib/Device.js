'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const { blank } = require('./Utils');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device added
  async onOAuth2Added() {
    this.log('Added');
  }

  // Device deleted
  async onOAuth2Deleted() {
    // Unregister event listeners
    this.unregisterEventListeners();

    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Migrate device
    await this.migrate();

    // Register listeners
    this.registerListeners();

    // Wait for application
    await this.homey.ready();

    // Synchronize
    await this.homey.app.sync(this.getData().id);

    this.log('Initialized');
  }

  // Device destroyed
  async onOAuth2Uninit() {
    // Unregister event listeners
    this.unregisterEventListeners();

    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync() {
    const { id } = this.getData();

    let data;

    try {
      data = this.homey.app.devices[id] || {};

      if (blank(data)) {
        throw new Error(this.homey.__('errors.404'));
      }

      this.log('[Sync]', JSON.stringify(data));

      await this.setCapabilities(data);
      await this.setAvailability(data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('[Sync]', err.toString());
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      data = null;
    }
  }

  /*
  | Listener functions
  */

  // Register listeners
  registerListeners() {
    this.registerCapabilityListeners();
    this.registerEventListeners();
  }

  // Register capability listeners
  registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('operating_mode', this.onCapabilityOperatingMode.bind(this));
    this.registerCapabilityListener('settable_mode', this.onCapabilitySettableMode.bind(this));

    this.log('Capability listeners registered');
  }

  // Register event listeners
  registerEventListeners() {
    if (this.onSync) return;

    this.onSync = this.sync.bind(this);

    this.homey.on('sync', this.onSync);
  }

  // Unregister event listeners
  unregisterEventListeners() {
    if (!this.onSync) return;

    this.homey.off('sync', this.onSync);

    this.onSync = null;
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
