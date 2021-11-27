'use strict';

const {OAuth2Client} = require('homey-oauth2app');

class Client extends OAuth2Client {

  static API_URL = 'https://api.senzthermostat.nvent.com';
  static TOKEN_URL = 'https://id.senzthermostat.nvent.com/connect/token';
  static AUTHORIZATION_URL = 'https://id.senzthermostat.nvent.com/connect/authorize';
  static SCOPES = ['offline_access', 'restapi'];

  /*
  |-----------------------------------------------------------------------------
  | Client events
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

  // Request response is not OK
  async onHandleNotOK({body, status, statusText, headers}) {
    this.error('Request not OK', JSON.stringify({
      body: body,
      status: status,
      statusText: statusText,
      headers: headers
    }));

    switch (status) {
      case 401:
        return new Error(this.homey.__('error.401'));
      case 404:
        return new Error(this.homey.__('error.404'));
      default:
        return new Error(this.homey.__('error.50x'));
    }
  }

  // Request error
  async onRequestError({err}) {
    this.error('Request error:', err.message);

    throw new Error(this.homey.__('error.50x'));
  }

  /*
  |-----------------------------------------------------------------------------
  | Synchronize actions
  |-----------------------------------------------------------------------------
  */

  // Sync device with details from nVent API
  async syncDevice(nventId) {
    const data = await this.getDevice(nventId);

    this.homey.emit('nvent:sync', data);
  }

  // Sync devices with details from nVent API
  async syncDevices() {
    const devices = await this.getDevices();

    devices.forEach(data => {
      this.homey.emit('nvent:sync', data);
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Client actions
  |-----------------------------------------------------------------------------
  */

  // Fetch thermostat by serial number
  async getDevice(nventId) {
    this.log(`Fetching thermostat ${nventId}`);

    const device = await this.get({
      path: `/api/v1/Thermostat/${nventId}`,
      query: '',
      headers: {}
    });

    this.log(`Device ${nventId} response:`, JSON.stringify(device));

    return device;
  }

  // Fetch all thermostats
  async getDevices() {
    this.log('Fetching all thermostats');

    const devices = await this.get({
      path: '/api/v1/Thermostat',
      query: '',
      headers: {}
    });

    this.log('Devices response:', JSON.stringify(devices));

    return devices;
  }

  // Update thermostat mode
  async updateMode(data) {
    const mode = data.mode;

    // Delete mode from data
    delete data.mode;

    return this.put({
      path: `/api/v1/Mode/${mode}`,
      query: '',
      json: data,
      headers: {}
    });
  }

  // Update thermostat target temperature
  async updateTargetTemperature(data) {
    const mode = data.mode;

    // Delete mode from data
    delete data.mode;

    return this.put({
      path: `/api/v1/Mode/${mode}`,
      query: '',
      json: data,
      headers: {}
    });
  }

}

module.exports = Client;
