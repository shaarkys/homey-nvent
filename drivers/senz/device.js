'use strict';

const Homey = require('homey');
const {OAuth2Device} = require('homey-oauth2app');

const temperatureType = {
  absolute: 0,
  relative: 1
}

const thermostatMode = {
  1: 'auto',
  2: 'hold',
  3: 'manual',
  4: 'vacation',
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
    this.registerCapabilityListener('thermostat_mode', this.onCapabilityThermostatMode.bind(this));
    this.registerCapabilityListener('heating', this.onCapabilityHeating.bind(this));

    // Register event listeners
    this.homey.on('refresh_devices', this.onRefresh.bind(this));
    this.homey.on('enable_devices', this.onEnable.bind(this));
    this.homey.on('disable_devices', this.onDisable.bind(this));
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
      if (deviceData.hasOwnProperty('online')) {
        if (!deviceData.online) {
          return this.onDisable(this.homey.__('offline'));
        }
      }

      // Mode
      if (deviceData.hasOwnProperty('mode')) {
        const mode = deviceData.mode;

        if (!thermostatMode.hasOwnProperty(mode)) {
          this.error(`Unknown mode ID: '${mode}'`);
        } else {
          // Hack for 'Off' mode (set mode to 'Manual' and target temperature as
          // stated by nVent themselves.
          if (thermostatMode[mode] !== 'vacation' && thermostatMode[mode] !== 'off' &&
            deviceData.hasOwnProperty('setPointTemperature') &&
            Number(deviceData.setPointTemperature) === 500) {

            await this.setCapabilityValue('thermostat_mode', 'off');
          } else {
            await this.setCapabilityValue('thermostat_mode', thermostatMode[mode]);
          }
        }
      }

      // Heating
      if (deviceData.hasOwnProperty('isHeating')) {
        await this.setCapabilityValue('heating', deviceData.isHeating);
      }

      // Current temperature
      if (deviceData.hasOwnProperty('currentTemperature')) {
        const rounded = Math.round((deviceData.currentTemperature / 100) * 10) / 10;

        await this.setCapabilityValue('measure_temperature', rounded);
      }

      // Target temperature
      if (deviceData.hasOwnProperty('setPointTemperature')) {
        const rounded = Math.round((deviceData.setPointTemperature / 100) * 10) / 10;

        await this.setCapabilityValue('target_temperature', rounded);
      }

      this.log('Device ' + this.getData().id + ' updated');

      // Set available
      if (!this.getAvailable() && this.homey.app.hasConnection()) {
        await this.setAvailable();
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

  // This method will be called when the heating is changed
  onCapabilityHeating(heating) {
    return this.log(`Heating is changed to '${heating}'`);
  }

  // This method will be called when the target temperature needs to be changed
  onCapabilityTargetTemperature(temperature) {
    const rounded = Math.round(temperature * 2) / 2;

    this.log(`Target temperature changed to '${rounded}'`);

    return this.setTargetTemperature(rounded);
  }

  // This method will be called when the thermostat mode needs to be changed
  onCapabilityThermostatMode(mode) {
    this.log(`Thermostat mode changed to '${mode}'`);

    return this.setThermostatMode(mode);
  }

  /*
  |-----------------------------------------------------------------------------
  | API commands
  |-----------------------------------------------------------------------------
  */

  // Set target temperature
  async setTargetTemperature(temperature) {
    let mode = await this.getCapabilityValue('thermostat_mode');

    // Set to manual, or keep hold. Auto does not support setting temperature
    if (mode !== 'hold') {
      mode = 'manual';
    }

    const data = {
      serialNumber: String(this.getData().id),
      mode: String(mode),
      temperature: Number(temperature * 100),
      temperatureType: Number(temperatureType.absolute)
    };

    // Update thermostat
    await this.oAuth2Client.updateState(data);

    // Update thermostat mode capability
    await this.setCapabilityValue('target_temperature', temperature);

    // Update thermostat mode capability
    await this.setCapabilityValue('thermostat_mode', mode);

    return temperature;
  }

  // Set thermostat mode
  async setThermostatMode(mode) {
    if (mode === 'vacation') {
      throw new Error(this.homey.__('modeNotViaAPi'));
    }

    let data = {
      serialNumber: String(this.getData().id),
      mode: String(mode)
    };

    // Hack for 'Off' mode (set mode to 'Manual' and target temperature as
    // stated by nVent themselves.
    if (mode === 'off') {
      data = {
        serialNumber: String(this.getData().id),
        mode: 'manual',
        temperature: 500,
        temperatureType: Number(temperatureType.absolute)
      };
    }

    // Update thermostat
    await this.oAuth2Client.updateState(data);

    // Update thermostat mode capability
    await this.setCapabilityValue('thermostat_mode', mode);

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
