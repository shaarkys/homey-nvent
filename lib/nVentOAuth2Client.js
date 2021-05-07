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
    this.error(`Request failed: ${body}`);

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
  | Update thermostat mode
  |-----------------------------------------------------------------------------
  */

  async updateMode(data) {
    this.log('updateTargetTemperature', JSON.stringify(data));

    try {
      const mode = data.mode;

      // Delete mode from data
      delete data.mode;

      return this.put({
        path: `/api/v1/Mode/${mode}`,
        json: data
      });
    } catch (err) {
      this.error(`Mode update ${data.serialNumber} -`, err);

      throw new Error(this.homey.__('error.50x'));
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Update thermostat target temperature
  |-----------------------------------------------------------------------------
  */

  async updateTargetTemperature(data) {
    try {
      this.log('updateTargetTemperature', JSON.stringify(data));

      const mode = data.mode;

      // Delete mode from data
      delete data.mode;

      return this.put({
        path: `/api/v1/Mode/${mode}`,
        json: data
      });
    } catch (err) {
      this.error(`Target temperature update ${data.serialNumber} -`, err);

      throw new Error(this.homey.__('error.50x'));
    }
  }

}

module.exports = nVentOAuth2Client;
