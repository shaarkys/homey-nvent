'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const Client = require('./Client');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  /*
  | Support functions
  */

  // Register flow cards
  registerFlowCards() {
    // Trigger flow cards
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async ({ device, operatingMode }) => {
      return device.getCapabilityValue('operating_mode') === operatingMode;
    });

    // Action flow cards
    // ... then set operating mode to ...
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async ({ device, operatingMode }) => {
      await device.onCapabilityOperatingMode(operatingMode);
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
    this.homey.flow.getConditionCard('operating_mode_is').registerRunListener(async ({ device, operatingMode }) => {
      return device.getCapabilityValue('operating_mode') === operatingMode;
    });
  }

}

module.exports = App;
