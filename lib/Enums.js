'use strict';

module.exports = {
  TemperatureType: {
    absolute: 0,
    relative: 1,
  },
  ApiModeMapping: {
    program: 'auto',
    boost: 'hold',
    constant: 'manual',
  },
  OperatingModeMapping: {
    1: 'program', // "Auto" at API
    2: 'boost', // "Hold" at API
    3: 'constant', // "Manual" at API
    4: 'holiday', // Not available at API
    5: 'off', // Not available at API
  },
};
