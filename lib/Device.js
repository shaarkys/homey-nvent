'use strict';

const {OAuth2Device} = require('homey-oauth2app');
const {OperatingModeMapping} = require('./Enums');
const {filled} = require('./Utils');

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
    // Remove event listeners
    await this.removeEventListeners();

    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Make sure the connected capability is added
    if (!this.hasCapability('connected')) {
      this.addCapability('connected').catch(this.error);
    }

    // Register listeners
    await this.registerListeners();

    // Wait for driver to become ready
    await this.driver.ready();

    this.log('Initialized');

    // Synchronize device
    this.homey.emit('sync', this.getSetting('serial_number'));
  }

  // Device destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Set device data
  handleSyncData(data) {
    this.log('Update device', this.getData().id, JSON.stringify(data));

    const mode = data.mode;
    const operatingMode = OperatingModeMapping[mode];
    let settableMode = mode > 3 ? 'none' : operatingMode;

    // Current temperature
    if (filled(data.currentTemperature)) {
      const measureTemperature = Math.round((data.currentTemperature / 100) * 10) / 10;

      this.setCapabilityValue('measure_temperature', measureTemperature).catch(this.error);
    }

    // Target temperature
    if (filled(data.setPointTemperature)) {
      const targetTemperature = Math.round((data.setPointTemperature / 100) * 10) / 10;

      this.setCapabilityValue('target_temperature', targetTemperature).catch(this.error);
    }

    // Heating
    if (filled(data.isHeating)) {
      this.setCapabilityValue('heating', data.isHeating).catch(this.error);
    }

    // Antifreeze mode
    if (filled(data.setPointTemperature)) {
      if (data.setPointTemperature === 500 && operatingMode === 'constant') {
        settableMode = 'antifreeze';
      }
    }

    // Operating mode
    this.setCapabilityValue('operating_mode', operatingMode).catch(this.error);

    // Settable mode
    this.setCapabilityValue('settable_mode', settableMode).catch(this.error);

    // Connected
    if (filled(data.online)) {
      this.setCapabilityValue('connected', data.online).catch(this.error);
    }

    this.setAvailability(data);
  }

  /*
  | Listener functions
  */

  // Register listeners
  async registerListeners() {
    // Register capability listeners
    await this.registerCapabilityListeners();

    // Register event listeners
    await this.registerEventListeners();
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

  // Register event listeners
  async registerEventListeners() {
    const {id} = this.getData();

    this.onSync = this.handleSyncData.bind(this);
    this.onError = this.setUnavailable.bind(this);

    this.homey.on(`error:${id}`, this.onError);
    this.homey.on(`sync:${id}`, this.onSync);

    this.log(`Event listeners registered (${id})`);
  }

  // Remove event listeners
  async removeEventListeners() {
    const {id} = this.getData();

    this.homey.off(`error:${id}`, this.onError);
    this.homey.off(`sync:${id}`, this.onSync);

    this.onError = null;
    this.onSync = null;

    this.log(`Event listeners removed (${id})`);
  }

}

module.exports = Device;
