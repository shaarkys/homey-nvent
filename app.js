'use strict';

const Homey = require('homey');
const {OAuth2App} = require('homey-oauth2app');
const nVentOAuth2Client = require('./lib/nVentOAuth2Client');
const signalR = require('@microsoft/signalr');

const refreshDeviceInterval = 30 * 1000; // 30 seconds
const startConnectionInterval = 10 * 1000; // 10 seconds

class nVent extends OAuth2App {

  static OAUTH2_CLIENT = nVentOAuth2Client;
  //static OAUTH2_DEBUG = true;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  // Application initialized
  async onOAuth2Init() {
    this.log('Application initialized');

    // Reset connection
    this.resetConnection();

    // As SignalR does not notify us when the temperature changes or when the
    // heating starts, set a custom interval to update all devices once every 5 seconds.
    this.homey.setInterval(this.refreshDevices.bind(this), refreshDeviceInterval);

    // Start notification connection if not already started
    this.homey.setInterval(this.startNotifications.bind(this), startConnectionInterval);

    // Register app event listeners
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      this.stopNotifications();

      this.log('-- Unloaded! _o/ --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  // Update devices by action
  async refreshDevices() {
    if (Object.keys(this.getSavedOAuth2Sessions()).length === 0) {
      return;
    }

    // Refresh all devices
    this.homey.emit('refresh_devices');
  }

  /*
  |-----------------------------------------------------------------------------
  | Notification connection
  |-----------------------------------------------------------------------------
  */

  // Start notification connection
  async startNotifications() {
    // Check connection
    if (this.hasConnection()) {
      return;
    }

    let sessions = this.getSavedOAuth2Sessions();

    // Check if there are sessions available
    if (Object.keys(sessions).length === 0) {
      return this.resetConnection();
    }

    // Get oAuth session
    const sessionId = Object.keys(sessions)[0];
    const token = sessions[sessionId].token.access_token;
    const url = nVentOAuth2Client.API_URL;

    // Check if token is filled
    if (token == null) {
      return;
    }

    this.log('Starting notifications');

    // Set notifications connection
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${url}/v1/changenotifications?token=${token}`)
      .configureLogging(signalR.LogLevel.Warning)
      .withAutomaticReconnect()
      .build();

    try {
      // Start connection
      await connection.start();
      this.log('SignalR connected');

      // Subscribe for notifications
      await connection.invoke('Subscribe', ['2']);
      this.log('Subscribed for notifications');

      // Refresh device when notification is received
      connection.on('Notify', (list) => {
        list.forEach(notification => {
          this.homey.emit('refresh_devices', String(notification.id));
        });
      });

      // Notify when reconnecting
      connection.onreconnecting(error => {
        this.log(`Connection lost due to error "${error}". Reconnecting...`);
      });

      // Notify when reestablished
      connection.onreconnected(connectionId => {
        this.log(`Connection reestablished. Connected with connectionId '${connectionId}'`);
      });

      connection.onclose(error => {
        this.log(`Connection closed due to error "${error}".`);

        // Reset connection
        this.resetConnection()
      });

      this.connection = connection;
    } catch (err) {
      this.error(err);

      // Reset connection
      this.resetConnection();
    }
  }

  // Stop notifications
  async stopNotifications() {
    // No connection found
    if (!this.hasConnection()) {
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

      // Reset connection
      this.resetConnection();
    } catch (err) {
      this.error(err);

      this.resetConnection();
    }
  }

  // Connection check
  hasConnection() {
    return this.connection != null;
  }

  // Reset connection
  resetConnection() {
    this.connection = null;
  }
}

module.exports = nVent;
