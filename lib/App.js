'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const signalR = require('@microsoft/signalr');
const { HubConnectionState } = require('@microsoft/signalr');
const Client = require('./Client');
const { blank, filled } = require('./Utils');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  static SYNC_INTERVAL = 120;

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    this.homey.on('unload', () => this.unregisterServices.bind(this));

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  /*
  | Synchronization functions
  */

  // Synchronize devices
  async syncDevices() {
    let devices;
    let client;
    let result;

    try {
      devices = await this.getClientDevices();

      // No oAuth devices found
      if (blank(devices)) {
        this.unregisterWebhook();
        return;
      }

      /** @type Client */
      client = this.getFirstSavedOAuth2Client();
      result = await client.getDevices();

      if (blank(result)) {
        this.devicesNotFound(devices);
        this.unregisterWebhook();

        return;
      }

      await this.updateDevices(devices, result);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('Sync devices error:', err.message);
      }
    } finally {
      client = null;
      devices = null;
      result = null;
    }
  }

  // Update devices
  async updateDevices(devices, data) {
    if (blank(devices) || blank(data)) return;

    let device;

    for (const deviceData of data) {
      /** @type Device */
      device = devices.find((device) => String(device.getData().id) === String(deviceData.serialNumber));

      // Device not found
      if (!device) continue;

      await device.handleSyncData(deviceData);
    }

    devices = null;
    device = null;
    data = null;
  }

  /*
  | Services functions
  */

  // Register services
  registerServices() {
    this.registerTimer();
    this.registerWebhook().catch(this.error);
  }

  // Register timer
  registerTimer() {
    if (this.syncDevicesTimer) return;

    this.syncDevicesTimer = this.homey.setInterval(this.syncDevices.bind(this), (1000 * this.constructor.SYNC_INTERVAL));
  }

  // Register webhook
  async registerWebhook() {
    if (this.webhook) return;

    this.webhook = 'register';
    this.log('[Webhook] Registering...');

    // Wait one seconds
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let client;

    try {
      client = this.getFirstSavedOAuth2Client();
      if (blank(client)) return;

      const token = client.getToken().access_token;
      if (blank(token)) return;

      // Set connection
      this.webhook = new signalR.HubConnectionBuilder()
        .withUrl(`${Client.API_URL}/v1/changenotifications?token=${token}`)
        .configureLogging(signalR.LogLevel.Warning)
        .withAutomaticReconnect()
        .build();

      // Start connection
      await this.webhook.start();
      await this.webhook.invoke('Subscribe', ['2']);

      // Register event listeners
      this.registerWebhookListeners();

      this.log('[Webhook] Registered');
    } catch (err) {
      // Refresh token when unauthorized
      if (filled(err.statusCode) && err.statusCode === 401) {
        this.log('Refresh oAuth token');

        client.refreshToken().catch(this.error);
      } else if (err.message !== 'No OAuth2 Client Found') {
        this.error('Register webhook error:', err.toString());
      }

      this.webhook = null;
    } finally {
      client = null;
    }
  }

  // Unregister services
  unregisterServices() {
    this.unregisterTimer();
    this.unregisterWebhook();
  }

  // Unregister timer
  unregisterTimer() {
    if (!this.syncDevicesTimer) return;

    this.homey.clearInterval(this.syncDevicesTimer);

    this.syncDevicesTimer = null;
  }

  // Unregister webhook
  unregisterWebhook() {
    if (!this.webhook) return;

    this.log('[Webhook] Unregistering...');

    // Unsubscribe
    if (this.webhook.state === HubConnectionState.Connected) {
      this.webhook.invoke('Unsubscribe', ['2']).catch(this.error);
    }

    // Stop SignalR
    this.webhook.stop().catch(this.error);
    this.log('[Webhook] Unregistered');

    this.webhook = null;
  }

  /*
  | Webhook events
  */

  // Webhook connection closed
  onWebhookClosed(err) {
    this.webhook = null;

    let msg = '[Webhook] Connection closed';
    if (err) msg += ` due to error "${err}"`;

    this.log(msg);
  }

  // Webhook message received
  onWebhookMessage(data) {
    this.log('[Webhook] Received:', JSON.stringify(data));

    // Unregister timer
    this.unregisterTimer();

    // Synchronize devices
    this.syncDevices().catch(this.error);

    // Register timer
    this.registerTimer();
  }

  // Webhook reconnected
  onWebhookReconnected(connectionId) {
    this.log(`[Webhook] Connection reestablished with id '${connectionId}'`);
  }

  // Webhook reconnecting
  onWebhookReconnecting(err) {
    let msg = '[Webhook] Connection lost';
    if (err) msg += ` due to error "${err}"`;

    this.error(msg);
    this.log('[Webhook] Reconnecting...');
  }

  /*
  | Support functions
  */

  // Given devices are not found
  devicesNotFound(devices) {
    if (blank(devices)) return;

    for (const device of devices) {
      device.setUnavailable(this.homey.__('errors.404')).catch(this.error);
    }
  }

  // Register webhook listeners
  registerWebhookListeners() {
    if (!this.webhook) return;

    this.webhook.onreconnecting(this.onWebhookReconnecting.bind(this));
    this.webhook.onreconnected(this.onWebhookReconnected.bind(this));
    this.webhook.onclose(this.onWebhookClosed.bind(this));
    this.webhook.on('Notify', this.onWebhookMessage.bind(this));

    this.log('[Webhook] Listeners registered');
  }

  // Register flow cards
  registerFlowCards() {
    // Trigger flow cards
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('operating_mode') === args.operating_mode;
    });

    // Action flow cards
    // ... then set operating mode to ...
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async (args) => {
      await args.device.onCapabilityOperatingMode(args.operating_mode);
    });

    // Condition flow cards
    // ... and connected is ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and heating is ...
    this.homey.flow.getConditionCard('is_heating').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('heating') === true;
    });

    // ... and operating mode is ...
    this.homey.flow.getConditionCard('operating_mode_is').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('operating_mode') === args.operating_mode;
    });
  }

  // Return client devices
  async getClientDevices() {
    const sessions = this.getSavedOAuth2Sessions();

    if (blank(sessions)) {
      return [];
    }

    const sessionId = Object.keys(sessions)[0];

    return this.getOAuth2Devices({ sessionId });
  }

}

module.exports = App;
