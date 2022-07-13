'use strict';

const {OAuth2Client} = require('homey-oauth2app');

class Client extends OAuth2Client {

  static API_URL = 'https://api.senzthermostat.nvent.com';
  static TOKEN_URL = 'https://id.senzthermostat.nvent.com/connect/token';
  static AUTHORIZATION_URL = 'https://id.senzthermostat.nvent.com/connect/authorize';
  static SCOPES = ['offline_access', 'restapi'];

  /*
  | Client events
  */

  // Request response is not OK
  async onHandleNotOK({body, status, statusText, headers}) {
    this.error('Request not OK', JSON.stringify({
      body: body,
      status: status,
      statusText: statusText,
      headers: headers
    }));

    const error = body.Messages && body.Messages[0] ? body.Messages[0] : null;

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
  async onHandleResult({result, status, statusText, headers}) {
    if (result === null || typeof result === 'object') {
      return result;
    }

    this.error('Invalid API result:', result);

    throw new Error(this.homey.__('errors.response'));
  }

  // Client initialized
  async onInit() {
    // Register event listeners
    await this.registerEventListeners();

    this.log('Initialized');
  }

  // Request error
  async onRequestError({err}) {
    this.error('Request error:', err.message);

    throw new Error(this.homey.__('errors.50x'));
  }

  // Client destroyed
  async onUninit() {
    // Remove event listeners
    await this.removeEventListeners();

    // Stop notifications and timer
    await this.homey.app.stopAll();

    this.log('Destroyed');
  }

  // Synchronize all devices
  async sync() {
    try {
      const devices = await this.getDevices();

      // No devices found
      if (!Array.isArray(devices) || devices.length <= 0) {
        this.log('No devices found');

        // Stop notifications and timer
        await this.homey.app.stopAll();

        return;
      }

      try {
        const result = await this.fetchDevices();

        // No devices found in response
        if (result.length <= 0) {
          return;
        }

        // Start notifications and timer
        await this.homey.app.startAll();

        // Set devices data
        result.forEach(data => {
          const i = devices.findIndex(el => el.getData().id === data.serialNumber);

          if (i < 0) {
            return;
          }

          this.homey.emit(`sync:${data.serialNumber}`, data);

          devices.splice(i, 1);
        });

        // Disable devices which are not in API response
        devices.forEach(device => {
          const {id} = device.getData();
          this.homey.emit(`error:${id}`, this.homey.__('errors.404'));
        });
      } catch (err) {
        devices.forEach(device => {
          const {id} = device.getData();
          this.homey.emit(`error:${id}`, err.message);
        });
      }
    } catch (err) {
      this.error('Sync error:', err.message);
    }
  }

  /*
  | Client actions
  */

  // Fetch all devices
  async fetchDevices() {
    this.log('Fetching all devices');

    const result = await this.get({
      path: '/api/v1/Thermostat',
      query: '',
      headers: {}
    });

    this.log('Devices response:', JSON.stringify(result));

    return result;
  }

  // Update device mode
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

  // Update device target temperature
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

  /*
  | Device actions
  */

  // Return all oAuth devices
  async getDevices() {
    try {
      const sessions = this.homey.app.getSavedOAuth2Sessions();

      // Check if there are sessions available
      if (Object.keys(sessions).length === 0) {
        return [];
      }

      const sessionId = Object.keys(sessions)[0];
      const configId = sessions[sessionId]['configId'];

      return this.homey.app.getOAuth2Devices({sessionId, configId})
    } catch (err) {
      this.error(`Client error: ${err.message}`);
    }

    return [];
  }

  /*
  | Listener functions
  */

  // Register event listeners
  async registerEventListeners() {
    // Already registered
    if (this.homey.listenerCount('sync') > 0) {
      return;
    }

    this.onSync = this.sync.bind(this);

    this.homey.on('sync', this.onSync);

    this.log('Event listeners registered');
  }

  // Remove event listeners
  async removeEventListeners() {
    // Not registered
    if (this.homey.listenerCount('sync') <= 0) {
      return;
    }

    this.homey.off('sync', this.onSync);

    this.onSync = null;

    this.log('Event listeners removed');
  }

}

module.exports = Client;
