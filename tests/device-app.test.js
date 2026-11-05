'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { load } = require('./helpers');
const Data = require('../lib/Data');

const Device = load('lib/Device.js', { 'homey-oauth2app': { OAuth2Device: class {} } });
const App = load('lib/App.js', { 'homey-oauth2app': { OAuth2App: class {} }, './Client': {} });

function deviceFixture(values = {}) {
  const device = new Device();
  device._id = 'test-serial';
  device.log = () => {};
  device.error = () => {};
  device.values = { target_temperature: 20, operating_mode: 'constant', settable_mode: 'constant', alarm_connectivity: false, ...values };
  device.getCapabilityValue = (name) => device.values[name];
  device.getCapabilities = () => Object.keys(device.values);
  device.setCapabilityValue = async (name, value) => { device.values[name] = value; };
  device.homey = { __: (key) => key, app: {}, flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) } };
  device.setUnavailable = async (reason) => { device.unavailable = reason; };
  device.setAvailable = async () => { device.unavailable = null; };
  device.setWarning = async () => {};
  device.unsetWarning = async () => {};
  return device;
}

function appFixture() {
  const app = new App();
  app.homey = new EventEmitter();
  app.log = () => {};
  app.error = () => {};
  app.setDefaults();
  app.registerWebhook = async () => {};
  app.unregisterTimer = () => {};
  app.homey.setInterval = () => { app.intervals = (app.intervals || 0) + 1; return 1; };
  app.homey.clearInterval = () => {};
  return app;
}

test('failed target-temperature request leaves local target and mode values unchanged', async () => {
  const device = deviceFixture({ operating_mode: 'program', settable_mode: 'program' });
  const before = { ...device.values };
  device.oAuth2Client = { updateTargetTemperature: async () => { throw new Error('API rejected'); } };
  await assert.rejects(device.setTargetTemperature(24), /API rejected/);
  assert.deepEqual(device.values, before);
});

test('manual temperature from antifreeze uses manual mode and updates state after success', async () => {
  const device = deviceFixture({ settable_mode: 'antifreeze' });
  let payload;
  device.oAuth2Client = { updateTargetTemperature: async (data) => {
    payload = data;
    assert.equal(device.values.target_temperature, 20);
  } };
  await device.setTargetTemperature(24);
  assert.deepEqual(payload, { serialNumber: 'test-serial', mode: 'manual', temperature: 2400, temperatureType: 0 });
  assert.equal(device.values.target_temperature, 24);
  assert.equal(device.values.settable_mode, 'constant');
});

test('unsupported modes and invalid temperatures make no requests or capability writes', async () => {
  const device = deviceFixture({ settable_mode: 'invalid' });
  const before = { ...device.values };
  device.oAuth2Client = { updateMode: () => assert.fail(), updateTargetTemperature: () => assert.fail() };
  await assert.rejects(device.setTargetTemperature(24), /invalid_mode/);
  for (const value of ['off', 'holiday', 'constructor', 'unknown']) {
    await assert.rejects(device.setOperatingMode(value), /invalid_mode/);
  }
  for (const value of [NaN, Infinity, 0, 41]) await assert.rejects(device.setTargetTemperature(value), /invalid_temperature/);
  assert.deepEqual(device.values, before);
});

test('sync failure marks devices unavailable, and a successful retry restores availability', async () => {
  const app = appFixture();
  const device = deviceFixture({ measure_temperature: 20 });
  device.homey.app = app;
  const pending = [];
  app.homey.on('sync', () => pending.push(device.sync()));
  app.getSavedOAuth2Client = async () => ({ getDevices: async () => { throw new Error('error.network'); } });
  await app.sync();
  await Promise.all(pending);
  assert.equal(app.devices, null);
  assert.equal(device.unavailable, 'error.network');
  app.getSavedOAuth2Client = async () => ({ getDevices: async () => [{ serialNumber: 'test-serial', currentTemperature: 2150, online: true }] });
  await app.sync();
  await Promise.all(pending);
  assert.equal(device.unavailable, null);
  assert.equal(device.values.measure_temperature, 21.5);
  assert.equal(app.syncError, null);
});

test('missing devices and null caches are unavailable rather than appearing healthy', async () => {
  const device = deviceFixture();
  for (const cache of [null, {}, { another: { serialNumber: 'another' } }]) {
    device.homey.app.devices = cache;
    await device.sync();
    assert.equal(device.unavailable, 'error.404');
  }
});

test('legacy connectivity triggers fire once per transition, after the capability write', async () => {
  const device = deviceFixture();
  const triggers = [];
  device.homey.flow.getDeviceTriggerCard = (id) => ({ trigger: async () => {
    triggers.push(id);
    assert.equal(device.values.alarm_connectivity, id === 'connected_false');
  } });
  await device.syncCapabilityValues({ alarm_connectivity: true });
  await device.syncCapabilityValues({ alarm_connectivity: true });
  await device.syncCapabilityValues({ alarm_connectivity: false });
  assert.deepEqual(triggers, ['connected_false', 'connected_true']);
});

test('failed capability writes prevent marking a device available', async () => {
  const device = deviceFixture();
  device.homey.app.devices = { 'test-serial': { serialNumber: 'test-serial', setPointTemperature: 2400 } };
  device.setCapabilityValue = async () => { throw new Error('write failed'); };
  await device.sync();
  assert.equal(device.unavailable, 'write failed');
});

test('unload during synchronization does not restart polling, create a webhook or emit updates', async () => {
  const app = appFixture();
  let finish;
  let started;
  const fetching = new Promise((resolve) => { started = resolve; });
  app.getSavedOAuth2Client = async () => ({ getDevices: () => { started(); return new Promise((resolve) => { finish = resolve; }); } });
  app.registerWebhook = async () => assert.fail('webhook registered after unload');
  app.homey.on('sync', () => assert.fail('device update after unload'));
  const pending = app.sync();
  await fetching;
  await app.onOAuth2Uninit();
  finish([{ serialNumber: 'test-serial' }]);
  await pending;
  assert.equal(app.intervals || 0, 0);
  assert.equal(app.devices, null);
});

test('webhook teardown stops connecting and connected hubs and clears its reference', async () => {
  for (const state of ['Connecting', 'Connected', 'Disconnected']) {
    const app = appFixture();
    let stops = 0;
    app.webhook = { state, stop: async () => { stops++; } };
    await app.unregisterWebhook();
    assert.equal(stops, 1);
    assert.equal(app.webhook, null);
  }
});

test('migration preserves the connectivity value and is idempotent', async () => {
  const device = deviceFixture();
  device.values = { connected: false };
  const operations = [];
  device.hasCapability = (name) => Object.hasOwn(device.values, name);
  device.addCapability = async (name) => { operations.push(`add:${name}`); device.values[name] = null; };
  device.removeCapability = async (name) => { operations.push(`remove:${name}`); delete device.values[name]; };
  await device.migrate();
  await device.migrate();
  assert.equal(device.values.alarm_connectivity, true);
  assert.deepEqual(operations, ['add:alarm_connectivity', 'remove:connected']);
});

test('failed migration addition preserves the old connectivity capability', async () => {
  const device = deviceFixture();
  device.values = { connected: true };
  device.hasCapability = (name) => Object.hasOwn(device.values, name);
  device.addCapability = async () => { throw new Error('add failed'); };
  device.removeCapability = () => assert.fail('must preserve old capability');
  await assert.rejects(device.migrate(), /add failed/);
  assert.equal(device.values.connected, true);
});

test('pairing ignores missing identities and handles malformed entries safely', () => {
  for (const raw of [null, undefined, {}, { name: 'Missing ID' }]) assert.equal(new Data(raw).device, null);
  assert.equal(new Data({ serialNumber: 'stable-id', name: 'Thermostat' }).device.data.id, 'stable-id');
});
