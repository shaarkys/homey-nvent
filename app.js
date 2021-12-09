'use strict';

const {Log} = require('homey-log');
const {OAuth2App} = require('homey-oauth2app');
const Client = require('./lib/Client');
const signalR = require('@microsoft/signalr');

class nVent extends OAuth2App {

  static OAUTH2_CLIENT = Client;
  //static OAUTH2_DEBUG = true;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({homey: this.homey});

    // Reset properties
    this.refreshInterval = 60 * 1000; // 1 minute
    this.connection = null;
    this.client = null;
    this.refreshTimer = null;

    // Register flow cards
    this._registerActionFlowCards();
    this._registerConditionFlowCards();
    this._registerDeviceTriggerFlowCards();

    // Register app event listeners
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      this.stopNotifications();

      this.log('-- Unloaded! --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  startTimers() {
    this.client = this.getFirstSavedOAuth2Client();

    if (!this.refreshTimer) {
      this.refreshTimer = this.homey.setInterval(this.refreshDevices.bind(this), this.refreshInterval);
    }

    this.startNotifications().catch(this.error);

    this.log('Timers started');
  }

  // Update devices by action
  async refreshDevices() {
    // Check for devices
    if (!this.hasOAuthDevices()) {
      return;
    }

    this.startNotifications().catch(this.error);

    try {
      // Sync all devices
      await this.client.syncDevices();
    } catch (err) {
      this.error(err.message);

      this.homey.emit('nvent:error', err.message);
    }
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

    // Check number of devices
    if (!this.hasOAuthDevices()) {
      return;
    }

    const token = this.client.getToken().access_token;

    this.log('Starting notifications');

    // Set notifications connection
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${Client.API_URL}/v1/changenotifications?token=${token}`)
      .configureLogging(signalR.LogLevel.Warning)
      .withAutomaticReconnect()
      .build();

    try {
      // Start connection
      this.log('Starting connection');

      await connection.start();
      this.log('SignalR connected');

      // Subscribe for notifications
      await connection.invoke('Subscribe', ['2']);
      this.log('Subscribed for notifications');

      // Refresh device when notification is received
      connection.on('Notify', (list) => {
        this.log('Notification received');

        // Stop refresh device interval because devices are updated
        this.homey.clearTimeout(this.refreshTimer);
        this.refreshTimer = null;

        // Process notifications
        list.forEach(notification => {
          const deviceId = String(notification.id);
          this.client.syncDevice(deviceId).catch(this.error);
        });

        // Start refresh device interval
        if (!this.refreshTimer) {
          this.refreshTimer = this.homey.setInterval(this.refreshDevices.bind(this), this.refreshInterval);
        }
      });

      // Notify when reconnecting
      connection.onreconnecting(err => {
        if (err) {
          this.log(`Connection lost due to error "${err}". Reconnecting...`);
        } else {
          this.log('Connection lost. Reconnecting...');
        }
      });

      // Notify when reestablished
      connection.onreconnected(connectionId => {
        this.log(`Connection reestablished. Connected with connectionId '${connectionId}'`);
      });

      connection.onclose(err => {
        if (err) {
          this.log(`Connection closed due to error "${err}"`);
        } else {
          this.log('Connection closed');
        }

        // Reset connection
        this.connection = null;
      });

      this.connection = connection;
    } catch (err) {
      this.error(err.message);

      if (err.statusCode === 401) {
        this.log('Refreshing oAuth token...');
        return this.client.refreshToken();
      }

      // Reset connection
      await this.stopNotifications();
    }
  }

  // Stop notifications
  async stopNotifications() {
    // No connection found
    if (!this.hasConnection()) {
      return;
    }

    // Devices are available
    if (this.hasOAuthDevices()) {
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

  // Connection check
  hasConnection() {
    return this.connection != null;
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow cards
  |-----------------------------------------------------------------------------
  */

  // Register action flow cards
  _registerActionFlowCards() {
    // ... then set operating mode to ...
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async (args) => {
      if (args.hasOwnProperty('device') && args.hasOwnProperty('operating_mode')) {
        return args.device.onCapabilityOperatingMode(args.operating_mode);
      }
    });
  }

  // Register condition flow cards
  _registerConditionFlowCards() {
    // ... and connected is ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async (args) => {
      if (args.hasOwnProperty('device')) {
        return args.device.getCapabilityValue('connected') === true;
      }
    });

    // ... and heating is ...
    this.homey.flow.getConditionCard('is_heating').registerRunListener(async (args) => {
      if (args.hasOwnProperty('device')) {
        return args.device.getCapabilityValue('heating') === true;
      }
    });

    // ... and operating mode is ...
    this.homey.flow.getConditionCard('operating_mode_is').registerRunListener(async (args) => {
      if (args.hasOwnProperty('device') && args.hasOwnProperty('operating_mode')) {
        return args.device.getCapabilityValue('operating_mode') === args.operating_mode;
      }
    });
  }

  // Register device trigger flow cards
  _registerDeviceTriggerFlowCards() {
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async (args) => {
      if (args.hasOwnProperty('device') && args.hasOwnProperty('operating_mode')) {
        return args.device.getCapabilityValue('operating_mode') === args.operating_mode;
      }
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Helpers
  |-----------------------------------------------------------------------------
  */

  // Returns whether devices are available
  hasOAuthDevices() {
    const sessions = this.getSavedOAuth2Sessions();

    // Check if there are sessions available
    if (Object.keys(sessions).length === 0) {
      this.log('No oAuth sessions found');

      return false;
    }

    // Get oAuth session
    const sessionId = Object.keys(sessions)[0];
    const configId = sessions[sessionId]['default'];

    const devices = this.getOAuth2Devices({sessionId, configId});

    return Object.keys(devices).length === 0;
  }
}

module.exports = nVent;
