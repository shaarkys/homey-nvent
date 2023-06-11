'use strict';

const { OAuth2Client } = require('homey-oauth2app');
const { blank, filled } = require('./Utils');

class Client extends OAuth2Client {

  static API_URL = 'https://api.senzthermostat.nvent.com';
  static TOKEN_URL = 'https://id.senzthermostat.nvent.com/connect/token';
  static AUTHORIZATION_URL = 'https://id.senzthermostat.nvent.com/connect/authorize';
  static SCOPES = ['offline_access', 'restapi'];

  /*
  | Device functions
  */

  // Return single device
  async getDevice(id) {
    const path = `/api/v1/Thermostat/${id}`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Return all devices
  async getDevices() {
    const path = '/api/v1/Thermostat';

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  /*
  | Device actions
  */

  // Update device mode
  async updateMode(data) {
    const { mode } = data;

    // Delete mode from data
    delete data.mode;

    const path = `/api/v1/Mode/${mode}`;

    this.log('PUT', path, JSON.stringify(data));

    return this.put({
      path,
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

    const path = `/api/v1/Mode/${mode}`;

    this.log('PUT', path, JSON.stringify(data));

    return this.put({
      path,
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

    // Client errors
    if (status === 401 || status === 403 || status === 404) {
      return new Error(this.homey.__(`errors.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('errors.50x'));
    }

    // Custom error message
    if (error) {
      return new Error(error);
    }

    // Unknown error
    return new Error(this.homey.__('errors.unknown'));
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (blank(result) || typeof result === 'object') {
      if (filled(result)) {
        this.log('Response', JSON.stringify(result));
      }

      return result;
    }

    this.error('Invalid response', result);

    throw new Error(this.homey.__('errors.50x'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('Request error', err.message);

    throw new Error(this.homey.__('errors.network'));
  }

}

module.exports = Client;
