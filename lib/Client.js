'use strict';

const {OAuth2Client} = require('homey-oauth2app');
const {blank, filled} = require('./Utils');

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

    const error = filled(body.Messages[0]) ? body.Messages[0] : null;

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
    if (blank(result) || typeof result === 'object') {
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

    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize device(s)
  async sync(id = null) {
    // Get all devices from API
    const devices = await this.getDevices();

    // No devices found in response
    if (blank(devices)) {
      return;
    }

    // Start notifications and timer
    await this.homey.app.startAll();

    // Synchronize single device
    if (id) {
      return this.syncDevice(id, devices);
    }

    // Synchronize all devices
    await this.syncDevices(devices);
  }

  // Synchronize single device
  async syncDevice(id, devices) {
    try {
      // Find device in result
      const device = devices.find(el => el.serialNumber === id);

      // Set devices data
      if (device) {
        this.homey.emit(`sync:${id}`, data);

        return;
      }

      // Device not found
      this.homey.emit(`error:${id}`, this.homey.__('errors.404'));
    } catch (err) {
      this.error(err.message);

      this.homey.emit(`error:${id}`, err.message);
    }
  }

  // Synchronize all devices
  async syncDevices(devices) {
    try {
      // Set devices data
      devices.forEach(data => {
        this.homey.emit(`sync:${data.serialNumber}`, data);
      });

      await this.setUnavailable(devices);
    } catch (err) {
      this.error(err.message);
    }
  }

  // Set devices unavailable which are missing in API response
  async setUnavailable(devices = []) {
    if (blank(devices)) {
      return;
    }

    const oAuthDevices = this.homey.app.getDevices();

    if (blank(oAuthDevices)) {
      return;
    }

    // Filter non-existing devices
    devices.forEach(data => {
      const i = oAuthDevices.findIndex(el => el.getData().id === data.serialNumber);

      if (i < 0) {
        return;
      }

      oAuthDevices.splice(i, 1);
    });

    // Disable devices which are not in API response
    oAuthDevices.forEach(device => {
      const {id} = device.getData();
      this.homey.emit(`error:${id}`, this.homey.__('errors.404'));
    });
  }

  /*
  | Client actions
  */

  // Return all devices
  async getDevices() {
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
  | Listener functions
  */

  // Register event listeners
  async registerEventListeners() {
    if (this.homey.listenerCount('sync') > 0) {
      return;
    }

    this.onSync = this.sync.bind(this);

    this.homey.on('sync', this.onSync);

    this.log('Event listeners registered');
  }

  // Remove event listeners
  async removeEventListeners() {
    if (this.homey.listenerCount('sync') <= 0) {
      return;
    }

    this.homey.off('sync', this.onSync);

    this.onSync = null;

    this.log('Event listeners removed');
  }

}

module.exports = Client;
