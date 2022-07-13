'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Notifications = require('./Notifications');
const Client = require('./Client');
const Timer = require('./Timer');
const Flow = require('./Flow');
const {Log} = require('homey-log');

class App extends OAuth2App {

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

    // Register flow cards
    this.flow = new Flow({homey: this.homey});

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

  // Clean application data
  async clean() {
    await this.stopAll();

    this.notifications = null;
    this.timer = null;
    this.flow = null;

    this.log('Data cleaned');
  }

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
