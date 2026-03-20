'use strict';

const { OAuth2Driver } = require('homey-oauth2app');
const Data = require('./Data');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  // Driver destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

  /*
  | Pairing functions
  */

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Pairing ${this.id}s`);

    const devices = await oAuth2Client.getDevices();

    return devices.map((device) => new Data(device).device).filter((e) => e);
  }

}

module.exports = Driver;
