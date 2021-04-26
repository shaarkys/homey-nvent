'use strict';

const Homey = require('homey');
const {OAuth2Client} = require('homey-oauth2app');

class nVentOAuth2Client extends OAuth2Client {

  static API_URL = 'https://api.senzthermostat.nvent.com';
  static TOKEN_URL = 'https://id.senzthermostat.nvent.com/connect/token';
  static AUTHORIZATION_URL = 'https://id.senzthermostat.nvent.com/connect/authorize';
  static SCOPES = ['offline_access', 'restapi'];

  /*
  |-----------------------------------------------------------------------------
  | Client initialization
  |-----------------------------------------------------------------------------
  */

  // Initialized
  async onInit() {
    this.log('Client initialized');
  }

  // Uninitialized
  async onUninit() {
    this.log('Client uninitialized');
  }

  /*
  |-----------------------------------------------------------------------------
  | Request failed
  |-----------------------------------------------------------------------------
  */

  async onHandleNotOK({body, status}) {
    this.error('Request failed', body);

    switch (status) {
      case 401:
        return new Error(this.homey.__('error.401'));
      case 404:
        return new Error(this.homey.__('error.404'));
      default:
        return new Error(this.homey.__('error.50x'));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Request error
  |-----------------------------------------------------------------------------
  */

  async onRequestError({err}) {
    this.error('Request error', err);

    throw new Error(this.homey.__('error.50x'));
  }

  /*
  |-----------------------------------------------------------------------------
  | Fetch thermostat by serial number
  |-----------------------------------------------------------------------------
  */

  async getById(id) {
    try {
      return this.get({path: `/api/v1/Thermostat/${id}`});
    } catch (err) {
      this.error(`Could not fetch thermostat '${id}'`, err);

      throw new Error(this.homey.__('error.50x'));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Fetch all thermostats
  |-----------------------------------------------------------------------------
  */

  async getAll() {
    try {
      return this.get({path: '/api/v1/Thermostat'});
    } catch (err) {
      this.error('Could not fetch all thermostats', err);

      throw new Error(this.homey.__('error.50x'));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Update thermostat
  |-----------------------------------------------------------------------------
  */

  async updateState(data) {
    // Serial number is required
    if (!data.hasOwnProperty('serialNumber')) {
      this.error('Update requires `serialNumber` key', data);

      throw new Error(this.homey.__('updateError'));
    }

    // Mode is required
    if (!data.hasOwnProperty('mode')) {
      this.error('Update requires `mode` key', data);

      throw new Error(this.homey.__('updateError'));
    }

    try {
      const mode = data.mode;

      // Get data for mode
      data = this.getModeData(mode, data);

      return this.put({
        path: `/api/v1/Mode/${mode}`,
        json: data
      });
    } catch (err) {
      this.error(`Update for ${data.serialNumber} -`, err);

      throw new Error(this.homey.__('error.50x'));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Data manipulation
  |-----------------------------------------------------------------------------
  */

  // Return data for given mode
  getModeData(mode, data) {
    // Get data for `auto` mode
    if (mode === 'auto') {
      return this.getAutoModeData(data);
    }

    // Get data for `hold` mode
    if (mode === 'hold') {
      return this.getHoldModeData(data);
    }

    // Get data for `manual` mode
    if (mode === 'manual') {
      return this.getManualModeData(data);
    }

    // Throw error
    throw new Error(this.homey.__('modeNotViaAPi'));
  }

  // Return data for `auto` mode
  getAutoModeData(data) {
    for (const key in data) {
      if (key !== 'serialNumber') {
        delete data[key];
      }
    }

    return data;
  }

  // Return data for `hold` mode
  getHoldModeData(data) {
    for (const key in data) {
      if (key !== 'serialNumber' && key !== 'temperature' && key !== 'holdUntil' && key !== 'temperatureType') {
        delete data[key];
      }
    }

    return data;
  }

  // Return data for `manual` mode
  getManualModeData(data) {
    for (const key in data) {
      if (key !== 'serialNumber' && key !== 'temperature' && key !== 'temperatureType') {
        delete data[key];
      }
    }

    return data;
  }

}

module.exports = nVentOAuth2Client;
