'use strict';

const { OAuth2Driver } = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  /*
  | Pairing functions
  */

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Pairing ${this.id}s...`);

    this.log('Get devices from API');
    const devices = await oAuth2Client.getDevices();

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  // Return data to create the device
  getDeviceData(device) {
    const data = {
      name: device.name,
      data: {
        id: device.serialNumber,
      },
      settings: {
        boost_temperature: 26,
        constant_temperature: 22,
      },
    };

    this.log('Device found', JSON.stringify(data));

    return data;
  }

}

module.exports = Driver;
