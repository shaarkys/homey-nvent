'use strict';

const { OAuth2Driver } = require('homey-oauth2app');
const { HubConnectionState } = require('@microsoft/signalr');
const signalR = require('@microsoft/signalr');
const Client = require('./Client');
const { blank } = require('./Utils');

class Driver extends OAuth2Driver {

  // Driver initialized
  async onOAuth2Init() {
    // Setup number of devices
    this.numberOfDevices = 0;

    // Setup timer and notifications
    this.timer = null;
    this.notifications = null;

    // Register flow cards
    this.registerActionFlowCards();
    this.registerConditionFlowCards();
    this.registerDeviceTriggerFlowCards();

    this.log('Initialized');
  }

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log('Listing devices');

    // Get all devices from API
    const devices = await oAuth2Client.getDevices();

    return devices.map((device) => this.getDeviceData(device));
  }

  // Return data to create the device
  getDeviceData(device) {
    return {
      name: device.name,
      data: {
        id: device.serialNumber,
      },
      settings: {
        boost_temperature: 26,
        constant_temperature: 22,
      },
    };
  }

  /*
  | Synchronization functions
  */

  async sync() {
    if (this.numberOfDevices <= 0) {
      await this.stopPolling();

      return;
    }

    try {
      const client = this.homey.app.getFirstSavedOAuth2Client();
      const result = await client.getDevices();

      result.forEach((data) => {
        /** @type SenzDevice|Device */
        const device = this.getDevice({ id: data.serialNumber });

        if (!device) {
          return;
        }

        try {
          device.handleSyncData(data);
        } catch (err) {
          device.error(err.message);
          device.setUnavailable(err.message).catch(device.error);
        }
      });
    } catch (err) {
      this.error(err.message);
    }
  }

  /*
  | Polling functions
  */

  // Start polling
  async enablePolling() {
    if (this.numberOfDevices < 0) {
      this.numberOfDevices = 0;
    }

    this.numberOfDevices++;

    // Enable update timer
    await this.enableTimer();

    // Enable notifications
    await this.enableNotifications();

    this.log('Polling enabled');
  }

  // Stop polling
  async stopPolling() {
    this.numberOfDevices--;

    if (this.numberOfDevices < 0) {
      this.numberOfDevices = 0;
    }

    // Devices are found
    if (this.numberOfDevices > 0) {
      return;
    }

    // Stop timer
    await this.stopTimer();

    // Stop notifications
    await this.stopNotifications();

    this.log('Polling stopped');
  }

  /*
  | Timer functions
  */

  // Start timer
  async enableTimer() {
    if (!this.timer) {
      this.timer = this.homey.setInterval(this.sync.bind(this), (1000 * 60));
    }
  }

  // Stop timer
  async stopTimer() {
    if (this.timer) {
      this.homey.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /*
  | Notification functions
  */

  // Start notifications
  async enableNotifications() {
    if (this.notifications) {
      return;
    }

    // Wait two seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.log('Starting notifications');

    try {
      const client = this.homey.app.getFirstSavedOAuth2Client();
      const token = client.getToken().access_token;

      // Set connection
      this.notifications = new signalR.HubConnectionBuilder()
        .withUrl(`${Client.API_URL}/v1/changenotifications?token=${token}`)
        .configureLogging(signalR.LogLevel.Warning)
        .withAutomaticReconnect()
        .build();

      // Start connection
      await this.notifications.start();
      this.log('Notifications connection started');

      // Subscribe for notifications
      await this.notifications.invoke('Subscribe', ['2']);
      this.log('Subscribed to notifications');

      // Register event listeners
      this.registerEventListeners();
    } catch (err) {
      if (blank(err.statusCode)) {
        this.error(err.toString());

        return;
      }

      // Refresh token when unauthorized
      if (err.statusCode === 401) {
        this.log('Refresh oAuth token');

        client.refreshToken().catch(this.error);
      }
    }
  }

  // Stop notifications
  async stopNotifications() {
    if (!this.notifications) {
      return;
    }

    this.log('Stopping notifications');

    try {
      // Unsubscribe
      if (this.notifications.state === HubConnectionState.Connected) {
        await this.notifications.invoke('Unsubscribe', ['2']);
        this.log('Unsubscribed from notifications');
      }

      // Stop SignalR
      await this.notifications.stop();
      this.log('Notifications stopped');
    } catch (err) {
      this.error(err.toString());
    } finally {
      this.notifications = null;
    }
  }

  /*
  | Register flow cards functions
  */

  // Register action flow cards
  registerActionFlowCards() {
    // ... then set operating mode to ...
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async ({ device, operatingMode }) => {
      await device.onCapabilityOperatingMode(operatingMode);
    });
  }

  // Register condition flow cards
  registerConditionFlowCards() {
    // ... and connected is ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and heating is ...
    this.homey.flow.getConditionCard('is_heating').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('heating') === true;
    });

    // ... and operating mode is ...
    this.homey.flow.getConditionCard('operating_mode_is').registerRunListener(async ({ device, operatingMode }) => {
      return device.getCapabilityValue('operating_mode') === operatingMode;
    });
  }

  // Register device trigger flow cards
  registerDeviceTriggerFlowCards() {
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async ({ device, operatingMode }) => {
      return device.getCapabilityValue('operating_mode') === operatingMode;
    });
  }

  /*
  | Notification events
  */

  // Notification connection closed
  async onNotificationClosed(err) {
    this.notifications = null;

    if (err) {
      this.log(`Notifications connection closed due to error "${err}"`);

      return;
    }

    this.log('Notifications connection closed');
  }

  // Notification received
  async onNotificationReceived(data) {
    this.log('Notification received:', JSON.stringify(data));

    // Stop timer
    await this.stopTimer();

    // Synchronize devices
    await this.sync();

    // Start timer
    await this.enableTimer();
  }

  // Notification reconnected
  async onNotificationReconnected(connectionId) {
    this.log(`Connection reestablished. Connected with id '${connectionId}'`);
  }

  // Notification reconnecting
  async onNotificationReconnecting(err) {
    if (err) {
      this.log(`Notifications connection lost due to error "${err}"`);
    } else {
      this.log('Notifications connection lost');
    }

    this.log('Reconnecting to notifications...');
  }

  /*
  | Register event listeners functions
  */

  // Register event listeners
  registerEventListeners() {
    if (!this.notifications) {
      return;
    }

    this.notifications.onreconnecting(this.onNotificationReconnecting.bind(this));
    this.notifications.onreconnected(this.onNotificationReconnected.bind(this));
    this.notifications.onclose(this.onNotificationClosed.bind(this));
    this.notifications.on('Notify', this.onNotificationReceived.bind(this));

    this.log('Event listeners registered');
  }

}

module.exports = Driver;
