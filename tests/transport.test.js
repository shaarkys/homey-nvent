'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const tls = require('node:tls');
const fetch = require('node-fetch');
const signalR = require('@microsoft/signalr');
const { load } = require('./helpers');
const { ServiceAgent } = require('../lib/ServiceTransport');

const FINGERPRINT = '64:24:DB:CA:AC:70:F8:6A:8B:8F:36:38:5E:96:B1:48:EF:E8:7D:73:EA:00:BD:F1:A9:F5:16:BF:04:F5:AF:0C';
const NOW = Date.parse('2026-11-05T12:00:00Z');
const HOST = 'id.senzthermostat.chemelex.com';
function socketWith(certificate = {}, authorizationError = 'CERT_HAS_EXPIRED') {
  return {
    authorized: false,
    authorizationError,
    getPeerCertificate: () => ({
      valid_to: 'Nov 4 23:59:59 2026 GMT',
      subjectaltname: `DNS:${HOST}, DNS:api.senzthermostat.chemelex.com`,
      fingerprint256: FINGERPRINT,
      ...certificate,
    }),
  };
}

test('accepts the pinned expired certificate only for its two hosts during the grace period', () => {
  const agent = new ServiceAgent();
  assert.equal(agent.validateSocket(socketWith(), HOST, NOW), null);
  assert.equal(agent.validateSocket(socketWith(), 'api.senzthermostat.chemelex.com', NOW), null);
  assert.ok(agent.validateSocket(socketWith(), 'unrelated.example', NOW));
  assert.ok(agent.validateSocket(socketWith(), HOST, Date.parse('2026-11-19T00:00:00Z')));
  assert.ok(agent.validateSocket(socketWith(), HOST, Date.parse('2026-11-03T00:00:00Z')));
});

test('rejects other certificates, hostname mismatches and non-expiry TLS errors', () => {
  const agent = new ServiceAgent();
  assert.ok(agent.validateSocket(socketWith({ fingerprint256: '00:00' }), HOST, NOW));
  assert.ok(agent.validateSocket(socketWith({ subjectaltname: 'DNS:wrong.example' }), HOST, NOW));
  for (const error of ['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_NOT_YET_VALID']) {
    assert.equal(agent.validateSocket(socketWith({}, error), HOST, NOW).code, error);
  }
});

test('accepts normally validated renewed certificates even after the workaround expires', () => {
  const agent = new ServiceAgent();
  assert.equal(agent.validateSocket({ authorized: true }, HOST, Date.parse('2027-01-01')), null);
});

test('withholds sockets from HTTP until verification and rejects before credentials can be written', () => {
  for (const authorized of [true, false]) {
    const socket = Object.assign(new EventEmitter(), socketWith({ fingerprint256: 'untrusted' }));
    socket.authorized = authorized;
    socket.setTimeout = () => socket;
    socket.destroy = () => { socket.destroyed = true; };
    const transport = load('lib/ServiceTransport.js', { tls: { ...tls, connect: () => socket } });
    const agent = new transport.ServiceAgent();
    let callbacks = 0;
    const returned = agent.createConnection({ host: HOST }, (error, connection) => {
      callbacks++;
      assert.equal(Boolean(error), !authorized);
      assert.equal(connection, authorized ? socket : undefined);
    });
    assert.equal(returned, undefined);
    assert.equal(callbacks, 0);
    socket.emit('secureConnect');
    assert.equal(callbacks, 1);
    assert.equal(Boolean(socket.destroyed), !authorized);
  }
});

test('request timeout rejects a handshake without delivering a socket', () => {
  const socket = new EventEmitter();
  let timeout;
  socket.setTimeout = (ms, callback) => { if (callback) timeout = callback; };
  socket.destroy = (error) => { if (error) socket.emit('error', error); };
  const { ServiceAgent: Agent } = load('lib/ServiceTransport.js', { tls: { ...tls, connect: () => socket } });
  let called = 0;
  new Agent().createConnection({ host: HOST }, (error, connection) => {
    called++;
    assert.match(error.message, /timed out/);
    assert.equal(connection, undefined);
  });
  timeout();
  assert.equal(called, 1);
});

test('HTTPS requests are bounded, reject redirects and refuse unrelated URLs', async () => {
  const calls = [];
  const transport = load('lib/ServiceTransport.js', {
    'node-fetch': async (url, options) => { calls.push({ url, options }); return {}; },
  });
  await transport.serviceFetch(`https://${HOST}/connect/token`, { method: 'POST' });
  assert.equal(calls[0].options.agent, transport.agent);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.timeout, 30000);
  for (const url of ['https://attacker.example/', `http://${HOST}/`, `https://${HOST}:444/`, `https://user:password@${HOST}/`]) {
    assert.throws(() => transport.serviceFetch(url), /unexpected/);
  }
  assert.equal(calls.length, 1);
});

test('SignalR uses validated HTTPS and WebSockets and retains session cookies', async () => {
  const calls = [];
  class FakeWebSocket {
    constructor(...args) { this.args = args; }
  }
  const transport = load('lib/ServiceTransport.js', {
    ws: FakeWebSocket,
    'node-fetch': async (url, options) => {
      calls.push({ url, options });
      const response = new fetch.Response('negotiated', { url, status: 200, headers: { 'set-cookie': 'affinity=example; Secure; Path=/' } });
      return response;
    },
  });
  const options = transport.createSignalROptions();
  const response = await options.httpClient.post('https://api.senzthermostat.chemelex.com/negotiate', { content: '' });
  assert.equal(response.content, 'negotiated');
  assert.equal(calls[0].options.agent, transport.agent);
  assert.match(options.httpClient.getCookieString('wss://api.senzthermostat.chemelex.com/notifications'), /affinity=example/);
  const ws = new options.WebSocket('wss://api.senzthermostat.chemelex.com/notifications', undefined, { headers: { Cookie: 'affinity=example' } });
  assert.equal(ws.args[2].agent, transport.agent);
  assert.equal(ws.args[2].followRedirects, false);
  assert.equal(ws.args[2].headers.Cookie, 'affinity=example');
  assert.throws(() => new options.WebSocket('ws://api.senzthermostat.chemelex.com/'), /unexpected/);
  assert.throws(() => new options.WebSocket('wss://attacker.example/'), /unexpected/);
});

test('SignalR HTTP honors cancellation before and during a request', async () => {
  let calls = 0;
  const transport = load('lib/ServiceTransport.js', {
    'node-fetch': async (url, options) => {
      calls++;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
    },
  });
  const client = transport.createSignalROptions().httpClient;
  await assert.rejects(client.send({ abortSignal: { aborted: true } }), /abort/i);
  assert.equal(calls, 0);
  const abortSignal = { aborted: false };
  const pending = client.get('https://api.senzthermostat.chemelex.com/poll', { abortSignal });
  await new Promise((resolve) => setImmediate(resolve));
  abortSignal.onabort();
  await assert.rejects(pending, (error) => error instanceof signalR.AbortError);
  assert.equal(abortSignal.onabort, null);
});

test('SignalR deadlines retain TimeoutError so long polling can retry', async () => {
  const transport = load('lib/ServiceTransport.js', {
    'node-fetch': async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
    }),
  });
  const client = transport.createSignalROptions().httpClient;
  await assert.rejects(client.get('https://api.senzthermostat.chemelex.com/poll', { timeout: 5 }),
    (error) => error instanceof signalR.TimeoutError);
});

test('webhook diagnostics redact tokens from URLs', () => {
  const { redact } = require('../lib/ServiceTransport');
  assert.equal(redact('https://api.example/?token=secret&id=1&access_token=other'), 'https://api.example/?token=[redacted]&id=1&access_token=[redacted]');
});
