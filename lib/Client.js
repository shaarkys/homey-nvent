'use strict';

const { OAuth2Client } = require('homey-oauth2app');
const { blank, filled } = require('./Utils');

class Client extends OAuth2Client {

  static API_URL = 'https://api.senzthermostat.nvent.com';
  static TOKEN_URL = 'https://id.senzthermostat.nvent.com/connect/token';
  static AUTHORIZATION_URL = 'https://id.senzthermostat.nvent.com/connect/authorize';
  static SCOPES = ['offline_access', 'restapi'];

  /*
  | Client actions
  */

  // Return single device
  async getDevice(serial) {
    this.log(`Fetching device ${serial}`);

    const result = await this.get({
      path: `/api/v1/Thermostat/${serial}`,
      query: '',
      headers: {},
    });

    this.log(`Device ${serial} response:`, JSON.stringify(result));

    return result;
  }

  // Return all devices
  async getDevices() {
    this.log('Fetching all devices');

    const result = await this.get({
      path: '/api/v1/Thermostat',
      query: '',
      headers: {},
    });

    this.log('Devices response:', JSON.stringify(result));

    return result;
  }

  // Update device mode
  async updateMode(data) {
    const { mode } = data;

    // Delete mode from data
    delete data.mode;

    return this.put({
      path: `/api/v1/Mode/${mode}`,
      query: '',
      json: data,
      headers: {},
    });
  }

  // Update device target temperature
  async updateTargetTemperature(data) {
    const { mode } = data;

    // Delete mode from data
    delete data.mode;

    return this.put({
      path: `/api/v1/Mode/${mode}`,
      query: '',
      json: data,
      headers: {},
    });
  }

  /*
  | Client events
  */

  // Request response is not OK
  async onHandleNotOK({
    body, status, statusText, headers,
  }) {
    this.error('Request not OK', JSON.stringify({
      body,
      status,
      statusText,
      headers,
    }));

    const error = filled(body.Messages) && filled(body.Messages[0]) ? body.Messages[0] : null;

    // Unauthorized
    if (status === 401) {
      return new Error(this.homey.__('errors.401'));
    }

    // Device / page not found
    if (status === 404) {
      return new Error(this.homey.__('errors.404'));
    }

    // API internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('errors.50x'));
    }

    // Custom error message
    if (error) {
      return new Error(error);
    }

    // Invalid response
    return new Error(this.homey.__('errors.response'));
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (blank(result) || typeof result === 'object') {
      return result;
    }

    this.error('Invalid API response:', result);

    throw new Error(this.homey.__('errors.response'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('Request error:', err.message);

    throw new Error(this.homey.__('errors.50x'));
  }

}

module.exports = Client;
