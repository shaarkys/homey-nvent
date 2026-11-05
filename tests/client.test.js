'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fetch = require('node-fetch');
const { load } = require('./helpers');
const OAuth2Token = require('homey-oauth2app/lib/OAuth2Token');
const OAuth2Error = require('homey-oauth2app/lib/OAuth2Error');
const OAuth2Client = load('node_modules/homey-oauth2app/lib/OAuth2Client.js', { homey: { env: {} } });

function setup(responses = []) {
  const calls = [];
  const agent = {};
  const Client = load('lib/Client.js', {
    'homey-oauth2app': { OAuth2Client, OAuth2Error },
    './ServiceTransport': {
      agent,
      serviceFetch: async (url, options) => {
        calls.push({ url, options });
        return responses.shift() || new fetch.Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  const client = new Client({
    homey: { __: (key) => key }, token: OAuth2Token,
    clientId: 'test-client', clientSecret: 'test-secret',
    apiUrl: Client.API_URL, tokenUrl: Client.TOKEN_URL,
    redirectUrl: 'https://callback.athom.com/oauth2/callback', scopes: Client.SCOPES,
  });
  client.error = () => {};
  client.setToken({ token: new OAuth2Token({ access_token: 'old-access', refresh_token: 'old-refresh' }) });
  return { client, calls, agent };
}

test('code exchange, password grant and refresh use the scoped token transport and supported response handlers', async () => {
  const { client, calls } = setup();
  let saves = 0;
  client.on('save', () => saves++);
  const token = await client.getTokenByCode({ code: 'test-code' });
  assert.ok(token instanceof OAuth2Token);
  assert.equal(token.access_token, 'new-access');
  assert.equal(calls[0].options.body.get('grant_type'), 'authorization_code');
  assert.equal(calls[0].options.body.get('code'), 'test-code');
  await client.getTokenByCredentials({ username: 'test-user', password: 'test-password' });
  assert.equal(calls[1].options.body.get('scope'), 'openid offline_access restapi');
  assert.equal(calls[1].options.body.get('password'), 'test-password');
  await client.refreshToken();
  assert.equal(calls[2].options.body.get('grant_type'), 'refresh_token');
  assert.equal(calls[2].options.body.get('refresh_token'), 'new-refresh');
  assert.equal(saves, 1);
  assert.equal(client.getToken().refresh_token, 'new-refresh');
  for (const call of calls) assert.equal(call.url, 'https://id.senzthermostat.chemelex.com/connect/token');
});

test('token endpoint errors retain the stored token and do not save a failed refresh', async () => {
  const { client } = setup([new fetch.Response(JSON.stringify({ error: 'invalid_grant' }), {
    status: 400, headers: { 'content-type': 'application/json' },
  })]);
  let saves = 0;
  client.on('save', () => saves++);
  await assert.rejects(client.refreshToken(), /invalid_grant/);
  assert.equal(client.getToken().access_token, 'old-access');
  assert.equal(saves, 0);
});

test('refresh guards preserve the OAuth2Error contract without making a request', async () => {
  const { client, calls } = setup();
  for (const token of [null, new OAuth2Token({ access_token: 'no-refresh-token' })]) {
    client.setToken({ token });
    await assert.rejects(client.refreshToken(), (error) => error instanceof OAuth2Error);
  }
  assert.equal(calls.length, 0);
});

test('API requests retain bearer authentication, use the validated agent and reject redirects', async () => {
  const { client, agent } = setup();
  const { url, opts } = await client.onBuildRequest({ method: 'GET', path: '/api/v1/Thermostat' });
  assert.equal(url, 'https://api.senzthermostat.chemelex.com/api/v1/Thermostat');
  assert.equal(opts.headers.Authorization, 'Bearer old-access');
  assert.equal(opts.agent, agent);
  assert.equal(opts.timeout, 30000);
  assert.equal(opts.redirect, 'error');
  await assert.rejects(client.onBuildRequest({ method: 'GET', path: 'https://attacker.example/' }), /unexpected/);
});

test('handles both API message casings and string messages without truncating them', async () => {
  const { client } = setup();
  for (const body of [{ messages: ['Detailed error'] }, { Messages: ['Detailed error'] }, { messages: 'Detailed error' }]) {
    const error = await client.onHandleNotOK({ body, status: 400, statusText: 'Bad Request' });
    assert.equal(error.message, 'Detailed error');
    assert.equal(error.status, 400);
  }
  assert.equal((await client.onHandleNotOK({ body: null, status: 503 })).message, 'error.50x');
});

test('malformed device-list responses are rejected before overwriting device state', async () => {
  const { client } = setup();
  client._get = async () => ({ messages: ['unexpected'] });
  await assert.rejects(client.getDevices(), /error.50x/);
});

test('network errors retain the underlying cause without printing credential-bearing URLs', async () => {
  const { client } = setup();
  const logs = [];
  client.error = (...args) => logs.push(args);
  const cause = Object.assign(new Error('https://example/?token=secret'), { code: 'CERT_HAS_EXPIRED' });
  await assert.rejects(client.onRequestError({ err: cause }), (error) => error.cause === cause && error.message === 'error.network');
  assert.ok(!JSON.stringify(logs).includes('secret'));
  assert.match(JSON.stringify(logs), /CERT_HAS_EXPIRED/);
});
