'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  // Driver initialized
  async onOAuth2Init() {
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

}

module.exports = Driver;
