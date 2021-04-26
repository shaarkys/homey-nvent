'use strict';

const {OAuth2Driver} = require('homey-oauth2app');
const SenzDevice = require('./device.js');

class SenzDriver extends OAuth2Driver {

  /*
  |-----------------------------------------------------------------------------
  | Driver initialization
  |-----------------------------------------------------------------------------
  */

  async onOAuth2Init() {
    this.log('Driver initialized');

    // Register flow cards
    await this.registerActionFlowCards();
    await this.registerConditionFlowCards();
    await this.registerDeviceTriggerFlowCards();
  }

  /*
  |-----------------------------------------------------------------------------
  | Pair devices
  |-----------------------------------------------------------------------------
  */

  async onPairListDevices({oAuth2Client}) {
    this.log('Listing devices');

    const devices = await oAuth2Client.getAll();

    return devices.map(deviceData => {
      return {
        name: deviceData.name,
        data: {
          id: deviceData.serialNumber,
        }
      }
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow cards
  |-----------------------------------------------------------------------------
  */

  // Register action flow cards
  async registerActionFlowCards() {
    // Register a Flow card to trigger update thermostat mode
    this.homey.flow.getActionCard('thermostat_mode_set').registerRunListener(async (args) => {
      return args.device.onCapabilityThermostatMode(args.thermostat_mode);
    });
  }

  // Register condition flow cards
  async registerConditionFlowCards() {
    // Thermostat mode
    this.homey.flow.getConditionCard('thermostat_mode_is').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('thermostat_mode') === args.thermostat_mode;
    });
  }

  // Register device trigger flow cards
  async registerDeviceTriggerFlowCards() {
    // Thermostat mode changed
    this.homey.flow.getDeviceTriggerCard('thermostat_mode_changed').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('thermostat_mode') === args.thermostat_mode;
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Always use SenzDevice as device for this driver
  |-----------------------------------------------------------------------------
  */

  mapDeviceClass() {
    return SenzDevice;
  }

}

module.exports = SenzDriver;
