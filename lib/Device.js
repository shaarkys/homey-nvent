'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const { ApiModeMapping, TemperatureType, OperatingModeMapping } = require('./Enums');
const { blank, filled } = require('./Utils');

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
    await this.unregisterEventListeners();

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
        throw new Error(this.homey.__('error.404'));
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

  // Set availability
  async setAvailability(data) {
    if (blank(data)) return;

    // Offline
    if ('online' in data && !data.online) {
      throw new Error(this.homey.__('error.offline'));
    }
  }

  // Set capabilities
  async setCapabilities(data) {
    if (blank(data)) return;

    // Connection state
    if ('online' in data && this.hasCapability('connected')) {
      this.setCapabilityValue('connected', data.online).catch(this.error);

      // Offline
      if (!data.online) {
        return;
      }
    }

    // Current temperature
    if ('currentTemperature' in data) {
      const measureTemperature = Math.round((data.currentTemperature / 100) * 10) / 10;

      this.setCapabilityValue('measure_temperature', measureTemperature).catch(this.error);
    }

    // Heating
    if ('isHeating' in data) {
      this.setCapabilityValue('heating', data.isHeating).catch(this.error);
    }

    // Target temperature
    if ('setPointTemperature' in data) {
      const targetTemperature = Math.round((data.setPointTemperature / 100) * 10) / 10;

      this.setCapabilityValue('target_temperature', targetTemperature).catch(this.error);
    }

    // Modes
    if ('mode' in data) {
      const { mode } = data;
      const operatingMode = OperatingModeMapping[mode];
      let settableMode = mode > 3 ? 'none' : operatingMode;

      // Antifreeze mode
      if ('setPointTemperature' in data) {
        if (data.setPointTemperature === 500 && operatingMode === 'constant') {
          settableMode = 'antifreeze';
        }
      }

      // Operating mode
      this.setCapabilityValue('operating_mode', operatingMode).catch(this.error);

      // Settable mode
      this.setCapabilityValue('settable_mode', settableMode).catch(this.error);
    }
  }

  /*
  | Capability events
  */

  // Target temperature capability changed
  async onCapabilityTargetTemperature(temperature) {
    const rounded = Math.round(temperature * 2) / 2;

    this.log(`Capability 'target_temperature' is now '${rounded}°C'`);

    await this.setTargetTemperature(rounded);
  }

  // Operating mode capability changed
  async onCapabilityOperatingMode(mode) {
    if (this.getCapabilityValue('operating_mode') === mode) return;

    this.log(`Capability 'operating_mode' is now '${mode}'`);

    await this.setOperatingMode(mode);
  }

  // Settable mode capability changed
  async onCapabilitySettableMode(mode) {
    if (this.getCapabilityValue('') === mode) return;

    this.log(`Capability 'settable_mode' is now '${mode}'`);

    await this.setOperatingMode(mode);
  }

  /*
  | API commands
  */

  // Set target temperature
  async setTargetTemperature(temperature) {
    this.log(`Set target temperature to ${temperature}°C`);

    const { id } = this.getData();
    let mode = await this.getCapabilityValue('settable_mode');

    // Set to constant if settable mode is none or program
    if (mode === 'none' || mode === 'program') {
      mode = 'constant';
    }

    // Update thermostat target temperature
    this.setCapabilityValue('target_temperature', temperature).catch(this.error);

    // Update settable- and operating mode capabilities
    this.setCapabilityValue('operating_mode', mode).catch(this.error);
    this.setCapabilityValue('settable_mode', mode).catch(this.error);

    const data = {
      serialNumber: id,
      mode: ApiModeMapping[mode],
      temperature: Number(temperature * 100),
      temperatureType: TemperatureType.absolute,
    };

    // Update thermostat target temperature
    await this.oAuth2Client.updateTargetTemperature(data);
  }

  // Set operating mode
  async setOperatingMode(mode) {
    this.log(`Set operating mode to '${mode}'`);

    const { id } = this.getData();

    let temperature = null;
    let operationMode = mode;
    const settableMode = mode;

    if (settableMode === 'none') {
      operationMode = 'program';
    }

    const data = {
      serialNumber: String(id),
      mode: ApiModeMapping[operationMode],
    };

    // Boost mode, also set temperature from settings
    if (settableMode === 'boost') {
      if (this.getCapabilityValue('operating_mode') === 'off') {
        throw new Error(this.homey.__('error.invalid_mode'));
      }

      temperature = this.getSetting('boost_temperature');
    }

    // Constant mode
    if (settableMode === 'constant') {
      const constantTemperature = this.getSetting('constant_temperature');

      if (constantTemperature > 0) {
        if (constantTemperature < 5) {
          // Minimum temperature
          temperature = 5;
        } else {
          temperature = constantTemperature;
        }
      }
    }

    // Antifreeze mode
    if (settableMode === 'antifreeze') {
      operationMode = 'constant';
      data.mode = ApiModeMapping.constant;

      temperature = 5;
    }

    // Set temperature and type
    if (filled(temperature)) {
      data.temperature = temperature * 100;
      data.temperatureType = TemperatureType.absolute;
    }

    // Update operating mode
    await this.oAuth2Client.updateMode(data);

    // Update settable- and operating mode capabilities
    this.setCapabilityValue('operating_mode', operationMode).catch(this.error);
    this.setCapabilityValue('settable_mode', settableMode).catch(this.error);
  }

  /*
  | Listener functions
  */

  // Register listeners
  registerListeners() {
    this.registerCapabilityListeners();
    this.registerEventListeners();

    this.log('[Listeners] Registered');
  }

  // Register capability listeners
  registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('operating_mode', this.onCapabilityOperatingMode.bind(this));
    this.registerCapabilityListener('settable_mode', this.onCapabilitySettableMode.bind(this));
  }

  // Register event listeners
  registerEventListeners() {
    if (this.onSync) return;

    this.onSync = this.sync.bind(this);

    this.homey.on('sync', this.onSync);
  }

  // Unregister event listeners
  async unregisterEventListeners() {
    if (!this.onSync) return;

    this.homey.off('sync', this.onSync);

    this.onSync = null;

    this.log('[Listeners] Unregistered');
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
