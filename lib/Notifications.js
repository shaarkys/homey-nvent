'use strict';

const signalR = require('@microsoft/signalr');
const Client = require('./Client');
const {HubConnection, HubConnectionState} = require('@microsoft/signalr');

class Notifications {

  // Constructor
  constructor({homey}) {
    this.homey = homey;

    /** @type {HubConnection|null} */
    this.connection = null;
  }

  /*
  | Commands
  */

  // Start notifications
  async start() {
    if (this.connection) {
      return;
    }

    this.log('Starting...');

    try {
      const client = this.homey.app.getFirstSavedOAuth2Client();
      const token = client.getToken().access_token;

      // Set connection
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(`${Client.API_URL}/v1/changenotifications?token=${token}`)
        .configureLogging(signalR.LogLevel.Warning)
        .withAutomaticReconnect()
        .build();

      // Start connection
      await this.connection.start();
      this.log('Connection started');

      // Subscribe for notifications
      await this.connection.invoke('Subscribe', ['2']);
      this.log('Subscribed');

      // Register event listeners
      this.registerEventListeners();
    } catch (err) {
      this.handleError(err);

      // Stop notifications
      this.stop().catch(this.error);
    }
  }

  // Stop notifications
  async stop() {
    if (!this.connection) {
      return;
    }

    this.log('Stopping...');

    try {
      // Unsubscribe
      if (this.connection.state === HubConnectionState.Connected) {
        await this.connection.invoke('Unsubscribe', ['2']);
        this.log('Unsubscribed');
      }

      // Stop SignalR
      await this.connection.stop();
      this.log('Stopped');
    } catch (err) {
      this.handleError(err);
    } finally {
      this.connection = null;
    }
  }

  /*
  | Listener functions
  */

  // Register event listeners
  registerEventListeners() {
    if (!this.connection) {
      return;
    }

    // Connection reconnecting
    this.connection.onreconnecting(err => {
      if (err) {
        this.log(`Connection lost due to error "${err}"`);
      } else {
        this.log('Connection lost');
      }

      this.log('Reconnecting...');
    });

    // Connection reestablished
    this.connection.onreconnected(connectionId => {
      this.log(`Connection reestablished. Connected with id '${connectionId}'`);
    });

    // Connection closed
    this.connection.onclose(err => {
      if (err) {
        this.log(`Connection closed due to error "${err}"`);
      } else {
        this.log('Connection closed');
      }

      // Reset connection
      this.connection = null;
    });

    // Notification received
    this.connection.on('Notify', async (list) => {
      this.log('Received:', JSON.stringify(list));

      // Synchronize devices
      this.homey.emit('sync');

      // Restart timer
      await this.homey.app.timer.restart();
    });

    this.log('Event listeners registered');
  }

  /*
  | Support functions
  */

  handleError(err) {
    this.error(err.toString());

    if (err.statusCode !== 401) {
      return;
    }

    try {
      const client = this.homey.app.getFirstSavedOAuth2Client();

      this.log('Refresh oAuth token');

      client.refreshToken().catch(this.error);
    } catch (err) {
      this.error(err.toString());
    }

  }

  /*
  | Log functions
  */

  error() {
    this.homey.error('[App] [Notifications]', ...arguments);
  }

  log() {
    this.homey.log('[App] [Notifications]', ...arguments);
  }

}

module.exports = Notifications;
