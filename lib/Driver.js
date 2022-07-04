'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  // Driver initialized
  async onOAuth2Init() {
    this.log('Driver initialized (oAuth2)');
  }

  // Pair devices
  async onPairListDevices({oAuth2Client}) {
    this.log('Listing devices');

    const devices = await oAuth2Client.getDevices();

    return devices.map(deviceData => {
      return {
        name: deviceData.name,
        data: {
          id: deviceData.serialNumber,
        },
        settings: {
          boost_temperature: 26,
          constant_temperature: 22
        }
      }
    });
  }

}

module.exports = Driver;
