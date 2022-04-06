'use strict';

const Device = require('../../lib/Device');
const {ApiModeMapping, OperatingModeMapping, TemperatureType} = require('../../lib/Enums');

class SenzDevice extends Device {

  // Set device availability
  async setAvailability(data) {
    // Offline
    if (data.hasOwnProperty('online') && !data.online) {
      await this.setUnavailable(this.homey.__('offline'));
    } else {
      await this.setAvailable();
    }
  }

  // Set device capabilities
  async setCapabilities(data) {
    const mode = data.mode;
    const operatingMode = OperatingModeMapping[mode];
    let settableMode = mode > 3 ? 'none' : operatingMode;

    // Current temperature
    if (data.hasOwnProperty('currentTemperature')) {
      const measureTemperature = Math.round((data.currentTemperature / 100) * 10) / 10;

      this.setCapabilityValue('measure_temperature', measureTemperature).catch(this.error);
    }

    // Target temperature
    if (data.hasOwnProperty('setPointTemperature')) {
      const targetTemperature = Math.round((data.setPointTemperature / 100) * 10) / 10;

      this.setCapabilityValue('target_temperature', targetTemperature).catch(this.error);
    }

    // Heating
    if (data.hasOwnProperty('isHeating')) {
      this.setCapabilityValue('heating', data.isHeating).catch(this.error);
    }

    // Antifreeze mode
    if (data.hasOwnProperty('setPointTemperature')) {
      if (data.setPointTemperature === 500 && operatingMode === 'constant') {
        settableMode = 'antifreeze';
      }
    }

    // Operating mode
    this.setCapabilityValue('operating_mode', operatingMode).catch(this.error);

    // Settable mode
    this.setCapabilityValue('settable_mode', settableMode).catch(this.error);

    // Connected
    if (data.hasOwnProperty('online')) {
      this.setCapabilityValue('connected', data.online).catch(this.error);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Capabilities
  |-----------------------------------------------------------------------------
  */

  // Target temperature capability changed
  async onCapabilityTargetTemperature(temperature) {
    const rounded = Math.round(temperature * 2) / 2;

    this.log(`Target temperature changed to ${rounded}°C`);

    await this.setTargetTemperature(rounded);
  }

  // Operating mode capability changed
  async onCapabilityOperatingMode(mode) {
    if (this.getCapabilityValue('operating_mode') !== mode) {
      this.log(`Operating mode changed to '${mode}'`);

      await this.setOperatingMode(mode);
    }
  }

  // Settable mode capability changed
  async onCapabilitySettableMode(mode) {
    if (this.getCapabilityValue('settable_mode') !== mode) {
      this.log(`Settable mode changed to '${mode}'`);

      await this.setOperatingMode(mode);
    }
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
    this.setCapabilityValue('target_temperature', temperature).catch(this.error);

    // Update settable- and operating mode capabilities
    this.setCapabilityValue('operating_mode', mode).catch(this.error);
    this.setCapabilityValue('settable_mode', mode).catch(this.error);

    const data = {
      serialNumber: this.nventId,
      mode: ApiModeMapping[mode],
      temperature: Number(temperature * 100),
      temperatureType: TemperatureType.absolute
    };

    // Update thermostat target temperature
    await this.oAuth2Client.updateTargetTemperature(data);
  }

  // Set operating mode
  async setOperatingMode(mode) {
    const currentOperationMode = this.getCapabilityValue('operation_mode');

    let temperature = null;
    let operationMode = mode;
    let settableMode = mode;

    if (settableMode === 'none') {
      operationMode = 'program';
    }

    let data = {
      serialNumber: String(this.nventId),
      mode: ApiModeMapping[operationMode]
    };

    // Boost mode, also set temperature from settings
    if (settableMode === 'boost') {
      if (currentOperationMode === 'off') {
        throw new Error(this.homey.__('modeInvalid'));
      }

      temperature = this.getSetting('boost_temperature');
    }

    // Constant mode
    if (settableMode === 'constant') {
      let constantTemperature = this.getSetting('constant_temperature');

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
    if (temperature !== null) {
      data.temperature = temperature * 100;
      data.temperatureType = TemperatureType.absolute;
    }

    // Update operating mode
    await this.oAuth2Client.updateMode(data);

    // Update settable- and operating mode capabilities
    this.setCapabilityValue('operating_mode', operationMode).catch(this.error);
    this.setCapabilityValue('settable_mode', settableMode).catch(this.error);
  }

}

module.exports = SenzDevice;
