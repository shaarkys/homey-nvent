'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Notifications = require('./Notifications');
const {Log} = require('homey-log');
const Client = require('./Client');
const Timer = require('./Timer');
const {blank} = require('./Utils');

class App extends OAuth2App {

  static OAUTH2_DRIVERS = ['senz'];
  static OAUTH2_CLIENT = Client;

  /*
  | Application events
  */

  // Application initialized
  async onOAuth2Init() {
    // Register event listeners
    this.homey.on('unload', this.onUnload.bind(this));

    // Sentry logging
    this.homeyLog = new Log({homey: this.homey});

    // Register timer
    this.timer = new Timer({homey: this.homey});

    // Register notifications
    this.notifications = new Notifications({homey: this.homey});

    this.log('Initialized');
  }

  // Application destroyed
  async onUninit() {
    // Clean application data
    await this.clean();

    this.log('Destroyed');
  }

  // Application unload
  async onUnload() {
    // Clean application data
    await this.clean();

    this.log('Unloaded');
  }

  /*
  | Support functions
  */

  // Clean application data
  async clean() {
    await this.stopAll();

    this.notifications = null;
    this.timer = null;

    this.log('Data cleaned');
  }

  // Return all oAuth devices
  async getDevices() {
    try {
      const sessions = this.getSavedOAuth2Sessions();

      // Check if there are sessions available
      if (blank(sessions)) {
        this.log('No oAuth sessions found');

        // Stop notifications and timer
        await this.stopAll();

        return [];
      }

      const sessionId = Object.keys(sessions)[0];
      const configId = sessions[sessionId]['configId'];
      const devices = await this.getOAuth2Devices({sessionId, configId});

      if (blank(devices)) {
        this.log('No oAuth devices found');

        // Stop notifications and timer
        await this.stopAll();

        return [];
      }

      return devices;
    } catch (err) {
      this.error(err.message);
    }

    return [];
  }

  /*
  | Timer functions
  */

  // Start notifications and timer
  async startAll() {
    // Start notifications
    if (this.notifications) {
      await this.notifications.start();
    }

    // Start timer
    if (this.timer) {
      await this.timer.start();
    }
  }

  // Stop notifications and timer
  async stopAll() {
    // Stop notifications
    if (this.notifications) {
      await this.notifications.stop();
    }

    // Stop timer
    if (this.timer) {
      await this.timer.stop();
    }
  }

}

module.exports = App;
