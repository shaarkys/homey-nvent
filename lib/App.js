/* eslint-disable camelcase */

'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const signalR = require('@microsoft/signalr');
const { HubConnectionState } = require('@microsoft/signalr');
const Client = require('./Client');
const { blank, filled } = require('./Utils');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  static SYNC_INTERVAL = 2; // Minutes

  /*
  | Application events
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    this.homey.on('unload', () => this.onUninit());

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  // Application destroyed
  async onUninit() {
    this.unregisterTimer().catch(this.error);
    this.unregisterWebhook().catch(this.error);

    this.log('Destroyed');
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
        await this.unregisterWebhook();
        return;
      }

      /** @type Client */
      client = this.getFirstSavedOAuth2Client();

      this.log('Get devices from API');
      result = await client.getDevices();

      if (blank(result)) {
        this.devicesNotFound(devices);
        await this.unregisterWebhook();

        return;
      }

      await this.updateDevices(devices, result);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('[Sync]', err.message);
      }
    } finally {
      devices = null;
      client = null;
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

      // Sync data
      await device.handleSyncData(deviceData);
    }

    devices = null;
    device = null;
    data = null;
  }

  /*
  | Webhook functions
  */

  // Register webhook
  async registerWebhook() {
    if (this.webhook) return;

    this.webhook = 'register';
    this.log('[Webhook] Registering');

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
      await this.registerWebhookListeners();

      this.log('[Webhook] Registered');
    } catch (err) {
      // Refresh token when unauthorized
      if (filled(err.statusCode) && err.statusCode === 401) {
        this.log('[Webhook] Refresh oAuth token');

        client.refreshToken().catch(this.error);
      } else if (err.message !== 'No OAuth2 Client Found') {
        this.error('[Webhook]', err.message);
      }

      this.webhook = null;
    } finally {
      client = null;
    }
  }

  // Register webhook listeners
  async registerWebhookListeners() {
    if (!this.webhook) return;

    this.log('[Webhook] Registering listeners');

    this.webhook.onreconnecting(this.onWebhookReconnecting.bind(this));
    this.webhook.onreconnected(this.onWebhookReconnected.bind(this));
    this.webhook.onclose(this.onWebhookClosed.bind(this));
    this.webhook.on('Notify', this.onWebhookMessage.bind(this));

    this.log('[Webhook] Listeners registered');
  }

  // Unregister webhook
  async unregisterWebhook() {
    if (!this.webhook) return;

    this.log('[Webhook] Unregistering');

    // Unsubscribe
    if (this.webhook.state === HubConnectionState.Connected) {
      this.webhook.invoke('Unsubscribe', ['2']).catch(this.error);
    }

    // Stop SignalR
    this.webhook.stop().catch(this.error);
    this.webhook = null;

    this.log('[Webhook] Unregistered');
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
  async onWebhookMessage(body) {
    this.log('[Webhook] Received', JSON.stringify(body));

    // Unregister timer
    await this.unregisterTimer();

    // Synchronize devices
    await this.syncDevices();

    // Register timer
    await this.registerTimer();
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
    this.log('[Webhook] Reconnecting');
  }

  /*
  | Timer functions
  */

  // Register timer
  async registerTimer() {
    if (this.syncDevicesTimer) return;

    this.syncDevicesTimer = this.homey.setInterval(this.syncDevices.bind(this), (1000 * 60 * this.constructor.SYNC_INTERVAL));

    this.log('[Timer] Registered');
  }

  // Unregister timer
  async unregisterTimer() {
    if (!this.syncDevicesTimer) return;

    this.homey.clearInterval(this.syncDevicesTimer);

    this.syncDevicesTimer = null;

    this.log('[Timer] Unregistered');
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

  // Register flow cards
  registerFlowCards() {
    this.log('[FlowCards] Registering');

    // Trigger flow cards
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async ({ device, operating_mode }) => {
      return device.getCapabilityValue('operating_mode') === operating_mode;
    });

    // Action flow cards
    // ... then set operating mode to ...
    // eslint-disable-next-line camelcase
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async ({ device, operating_mode }) => {
      await device.onCapabilityOperatingMode(operating_mode);
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

    this.log('[FlowCards] Registered');
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

  // Register services
  async registerServices() {
    await this.registerTimer();
    await this.registerWebhook();
  }

}

module.exports = App;
