'use strict';

const Homey = require('homey');
const {OAuth2Device} = require('homey-oauth2app');

const temperatureType = {
  absolute: 0,
  relative: 1
}

const apiModeMapping = {
  'program': 'auto',
  'boost': 'hold',
  'constant': 'manual',
}

const operatingModeMapping = {
  1: 'program', // "Auto" at API
  2: 'boost', // "Hold" at API
  3: 'constant', // "Manual" at API
  4: 'holiday',
  5: 'off'
}

class SenzDevice extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device initialization
  |-----------------------------------------------------------------------------
  */

  // Initialized
  async onOAuth2Init() {
    this.log('Device initialized');

    // Refresh device data
    await this.onRefresh();

    // Register capability listeners
    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('operating_mode', this.onCapabilityOperatingMode.bind(this));
    this.registerCapabilityListener('settable_mode', this.onCapabilitySettableMode.bind(this));

    // Register event listeners
    this.homey.on('refresh_devices', this.onRefresh.bind(this));
  }

  // Saved
  async onOAuth2Saved() {
    this.log('Device saved');
  }

  // Uninitialized
  async onOAuth2Uninit() {
    this.log('Device uninitialized');
  }

  // Deleted
  async onOAuth2Deleted() {
    this.log('Device deleted');

    // Stop notification connection if no devices available
    if (Object.keys(this.driver.getDevices()).length === 0) {
      await this.homey.app.stopNotifications();
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Refresh device data
  |-----------------------------------------------------------------------------
  */

  async onRefresh(deviceId) {
    // Return when device ID is given, but does not match this device ID
    // If device ID not NOT given, it should update all devices
    if (deviceId != null && this.getData().id !== deviceId) {
      return;
    }

    try {
      // Fetch data from API
      const deviceData = await this.oAuth2Client.getById(this.getData().id);

      // Online
      if (!deviceData.online) {
        return this.onDisable(this.homey.__('offline'));
      }

      // Data
      const measureTemperature = Math.round((deviceData.currentTemperature / 100) * 10) / 10;
      const targetTemperature = Math.round((deviceData.setPointTemperature / 100) * 10) / 10;
      const mode = deviceData.mode;
      const operatingMode = operatingModeMapping[mode];
      const setMode = mode > 3 ? 'none' : operatingMode;

      // Set temperatures
      await this.setCapabilityValue('measure_temperature', measureTemperature);
      await this.setCapabilityValue('target_temperature', targetTemperature);

      // Modes
      await this.setCapabilityValue('operating_mode', operatingMode);
      await this.setCapabilityValue('settable_mode', setMode);

      // Set available
      if (!this.getAvailable()) {
        await this.onEnable();
      }
    } catch (err) {
      this.error(err.toString());

      await this.onDisable(err.toString());
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Capabilities
  |-----------------------------------------------------------------------------
  */

  // This method will be called when the target temperature needs to be changed
  onCapabilityTargetTemperature(temperature) {
    const rounded = Math.round(temperature * 2) / 2;

    this.log(`Target temperature changed to '${rounded}'`);

    return this.setTargetTemperature(rounded);
  }

  // This method will be called when the operating mode needs to be changed
  onCapabilityOperatingMode(mode) {
    if (this.getCapabilityValue('operating_mode') === mode) {
      return;
    }

    this.log(`Operating mode changed to '${mode}'`);
  }

  // This method will be called when the settable mode needs to be changed
  onCapabilitySettableMode(mode) {
    if (this.getCapabilityValue('settable_mode') === mode) {
      return;
    }

    this.log(`Settable mode changed to '${mode}'`);

    return this.setOperatingMode(mode);
  }

  /*
  |-----------------------------------------------------------------------------
  | API commands
  |-----------------------------------------------------------------------------
  */

  // Set target temperature
  async setTargetTemperature(temperature) {
    let mode = await this.getCapabilityValue('settable_mode');

    // Set to constant if settable mode is none or program
    if (mode === 'none' || mode === 'program') {
      mode = 'constant';
    }

    // Update thermostat target temperature
    await this.setCapabilityValue('target_temperature', temperature);

    // Update operating mode capabilities
    await this.setCapabilityValue('operating_mode', mode);
    await this.setCapabilityValue('settable_mode', mode);

    const data = {
      serialNumber: String(this.getData().id),
      mode: apiModeMapping[mode],
      temperature: Number(temperature * 100),
      temperatureType: Number(temperatureType.absolute)
    };

    // Update thermostat target temperature
    await this.oAuth2Client.updateTargetTemperature(data);

    return temperature;
  }

  // Set operating mode
  async setOperatingMode(mode) {
    if (mode === 'none')  {
      mode = 'program';
    }

    // Update operating mode capabilities
    await this.setCapabilityValue('operating_mode', mode);
    await this.setCapabilityValue('settable_mode', mode);

    let data = {
      serialNumber: String(this.getData().id),
      mode: apiModeMapping[mode]
    };

    // Update operating mode
    await this.oAuth2Client.updateMode(data);

    return mode;
  }

  /*
  |-----------------------------------------------------------------------------
  | Availability functions
  |-----------------------------------------------------------------------------
  */

  // Enable device
  async onEnable() {
    this.log('Device enabled');

    return this.setAvailable();
  }

  // Disable device
  async onDisable(reason) {
    this.log(`Device disabled: ${reason}`);

    return this.setUnavailable(reason);
  }

}

module.exports = SenzDevice;
