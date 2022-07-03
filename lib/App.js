'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Client = require('./Client');
const Flow = require('./Flow');
const {Log} = require('homey-log');
const signalR = require('@microsoft/signalr');

class nVent extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Reset state
    await this.resetState();

    // Register flow cards
    await new Flow({ homey: this.homey }).register();

    // Register event listeners
    await this.registerEventListeners();
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  // Refresh devices
  async refreshDevices() {
    if (await this.hasDevices()) {
      try {
        this.client = this.getFirstSavedOAuth2Client();

        // Sync all devices
        await this.client.syncDevices();

        // Start notifications
        this.startNotifications().catch(this.error);
      } catch (err) {
        this.error(err.message);

        this.homey.emit('nvent:error', err.message);
      }
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Notification connection
  |-----------------------------------------------------------------------------
  */

  // Start notification connection
  async startNotifications() {
    if (this.connection) {
      return;
    }

    // Check devices
    if (!await this.hasDevices()) {
      return;
    }

    try {
      this.client = this.getFirstSavedOAuth2Client();

      const token = this.client.getToken().access_token;

      this.log('Starting notifications');

      // Set notifications connection
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(`${Client.API_URL}/v1/changenotifications?token=${token}`)
        .configureLogging(signalR.LogLevel.Warning)
        .withAutomaticReconnect()
        .build();

      // Start connection
      this.log('Starting connection');

      await this.connection.start();
      this.log('SignalR connected');

      // Subscribe for notifications
      await this.connection.invoke('Subscribe', ['2']);
      this.log('Subscribed for notifications');

      // Refresh device when notification is received
      this.connection.on('Notify', (list) => {
        this.log('Notification received');

        // Process notifications
        list.forEach(notification => {
          this.client.syncDevice(String(notification.id)).catch(this.error);
        });
      });

      // Notify when reconnecting
      this.connection.onreconnecting(err => {
        if (err) {
          this.log(`Connection lost due to error "${err}". Reconnecting...`);
        } else {
          this.log('Connection lost. Reconnecting...');
        }
      });

      // Notify when reestablished
      this.connection.onreconnected(connectionId => {
        this.log(`Connection reestablished. Connected with connectionId '${connectionId}'`);
      });

      this.connection.onclose(err => {
        if (err) {
          this.log(`Connection closed due to error "${err}"`);
        } else {
          this.log('Connection closed');
        }

        // Reset connection
        this.connection = null;
      });
    } catch (err) {
      this.error(err.message);

      if (err.statusCode === 401) {
        this.log('Refreshing oAuth token...');
        return this.client.refreshToken();
      }

      // Stop notifications
      this.stopNotifications().catch(this.error);
    }
  }

  // Stop notifications
  async stopNotifications(force = false) {
    if (!this.connection) {
      return;
    }

    // Check devices
    if (await this.hasDevices() && !force) {
      return;
    }

    this.log('Stopping notifications');

    try {
      // Unsubscribe from notifications
      await this.connection.invoke('Unsubscribe', ['2']);
      this.log('Unsubscribed from notifications');

      // Stop SignalR
      await this.connection.stop();
      this.log('SignalR stopped!');
    } catch (err) {
      this.error(err);
    } finally {
      this.connection = null;
    }
  }

  // Register event listeners
  async registerEventListeners() {
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      this.stopAll(true).catch(this.error);

      this.log('-- Unloaded! --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Helpers
  |-----------------------------------------------------------------------------
  */

  // Returns whether app has devices
  async hasDevices() {
    try {
      const sessions = this.getSavedOAuth2Sessions();

      // Check if there are sessions available
      if (Object.keys(sessions).length === 0) {
        return false;
      }

      const sessionId = Object.keys(sessions)[0];
      const configId = sessions[sessionId]['configId'];
      const devices = await this.getOAuth2Devices({sessionId, configId})

      return Object.keys(devices).length > 0;
    } catch (err) {
      return false;
    }
  }

  // Reset state
  async resetState() {
    this.log('Reset state');

    this.connection = null;
    this.client = null;
    this.refreshInterval = 60 * 1000; // 1 minute
    this.refreshTimer = null;
  }

  // Start timer and notifications
  async startAll() {
    this.log('Start timer and notifications');

    await this.startTimer();
    await this.startNotifications();
  }

  // Start refresh timer
  async startTimer() {
    if (!this.refreshTimer) {
      this.refreshTimer = this.homey.setInterval(this.refreshDevices.bind(this), this.refreshInterval);

      this.log('Timer started');
    }
  }

  // Stop timer and notifications
  async stopAll(force = false) {
    if (!await this.hasDevices() || force) {
      this.log('Stop timer and notifications');

      await this.stopTimer(force);
      await this.stopNotifications(force);

      // Reset state
      await this.resetState();
    }
  }

  // Stop refresh timer
  async stopTimer(force = false) {
    if (this.refreshTimer) {
      // Check devices
      if (await this.hasDevices() && !force) {
        return;
      }

      this.homey.clearTimeout(this.refreshTimer);

      this.refreshTimer = null;

      this.log('Timer stopped');
    }
  }

}

module.exports = nVent;
