'use strict';

const { clean } = require('./Utils');
const { OperatingModeMapping } = require('./Enums');

class Data {

  constructor(raw) {
    Object.assign(this, clean(this.fromApiData(raw)));
  }

  get device() {
    return {
      name: this.name,
      data: { id: this.id },
      settings: {
        boost_temperature: 26,
        constant_temperature: 22,
      }
    };
  }

  fromApiData(raw) {
    const data = {};

    if ('currentTemperature' in raw) data.measure_temperature = Math.round((raw.currentTemperature / 100) * 10) / 10;
    if ('isHeating' in raw) data.heating = raw.isHeating;
    if ('name' in raw) data.name = raw.name;
    if ('online' in raw) data.alarm_connectivity = !raw.online;
    if ('serialNumber' in raw) data.id = raw.serialNumber;
    if ('setPointTemperature' in raw) data.target_temperature = Math.round((raw.setPointTemperature / 100) * 10) / 10;
    if ('mode' in raw) {
      data.operating_mode = OperatingModeMapping[raw.mode];
      data.settable_mode = raw.mode > 3 ? 'none' : data.operating_mode;
      if ('setPointTemperature' in raw && raw.setPointTemperature === 500 && data.operating_mode === 'constant') data.settable_mode = 'antifreeze';
    }

    return data;
  }

}

module.exports = Data;