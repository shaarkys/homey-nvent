'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  // Driver initialized
  async onOAuth2Init() {
    // Register flow cards
    this.registerActionFlowCards();
    this.registerConditionFlowCards();
    this.registerDeviceTriggerFlowCards();

    this.log('Initialized');
  }

  // Pair devices
  async onPairListDevices({oAuth2Client}) {
    this.log('Listing devices');

    // Get all devices from API
    const devices = await oAuth2Client.getDevices();

    return devices.map(device => this.getDeviceData(device));
  }

  // Get data to create the device
  getDeviceData(device) {
    return {
      name: device.name,
      data: {
        id: device.serialNumber
      },
      settings: {
        boost_temperature: 26,
        constant_temperature: 22
      }
    };
  }

  /*
  | Register flow cards functions
  */

  // Register action flow cards
  registerActionFlowCards() {
    // ... then set operating mode to ...
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async ({device, operating_mode}) => {
      await device.onCapabilityOperatingMode(operating_mode);
    });
  }

  // Register condition flow cards
  registerConditionFlowCards() {
    // ... and connected is ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({device}) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and heating is ...
    this.homey.flow.getConditionCard('is_heating').registerRunListener(async ({device}) => {
      return device.getCapabilityValue('heating') === true;
    });

    // ... and operating mode is ...
    this.homey.flow.getConditionCard('operating_mode_is').registerRunListener(async ({device, operating_mode}) => {
      return device.getCapabilityValue('operating_mode') === operating_mode;
    });
  }

  // Register device trigger flow cards
  registerDeviceTriggerFlowCards() {
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async ({device, operating_mode}) => {
      return device.getCapabilityValue('operating_mode') === operating_mode;
    });
  }

}

module.exports = Driver;
