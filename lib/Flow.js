'use strict';

class Flow {

  // Constructor
  constructor({ homey }) {
    this.homey = homey;
  }

  // Register flow cards
  async register() {
    try {
      await this._registerActionFlowCards();
      await this._registerConditionFlowCards();
      await this._registerDeviceTriggerFlowCards();
    } catch (err) {
      this.homey.error(`Could not register flow cards: ${err.message}`);
    }
  }

  // Register action flow cards
  async _registerActionFlowCards() {
    // ... then set operating mode to ...
    this.homey.flow.getActionCard('operating_mode_set').registerRunListener(async ({ device, operating_mode }) => {
      await device.onCapabilityOperatingMode(operating_mode);
    });
  }

  // Register condition flow cards
  async _registerConditionFlowCards() {
    // ... and connected is ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and heating is ...
    this.homey.flow.getConditionCard('is_heating').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('heating') === true;
    });

    // ... and operating mode is ...
    this.homey.flow.getConditionCard('operating_mode_is').registerRunListener(async ({ device, operating_mode }) => {
      return device.getCapabilityValue('operating_mode') === operating_mode;
    });
  }

  // Register device trigger flow cards
  async _registerDeviceTriggerFlowCards() {
    // When operating mode changed to ...
    this.homey.flow.getDeviceTriggerCard('operating_mode_changed').registerRunListener(async ({ device, operating_mode }) => {
      return device.getCapabilityValue('operating_mode') === operating_mode;
    });
  }

}

module.exports = Flow;
