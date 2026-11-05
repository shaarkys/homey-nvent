'use strict';

const { OAuth2Client, OAuth2Error } = require('homey-oauth2app');
const { blank, filled } = require('./Utils');
const { agent, serviceFetch } = require('./ServiceTransport');

class Client extends OAuth2Client {

  static API_URL = 'https://api.senzthermostat.chemelex.com';
  static TOKEN_URL = 'https://id.senzthermostat.chemelex.com/connect/token';
  static AUTHORIZATION_URL = 'https://id.senzthermostat.chemelex.com/connect/authorize';
  static SCOPES = ['openid', 'offline_access', 'restapi'];

  /*
  | Device functions
  */

  // Return all devices
  async getDevices() {
    const devices = await this._get('Thermostat');
    if (!Array.isArray(devices)) throw new Error(this.homey.__('error.50x'));
    return devices;
  }

  /*
  | Device actions
  */

  // Update device mode
  async updateMode(data) {
    const { mode } = data;

    // Delete mode from data
    delete data.mode;

    return this._put(`Mode/${mode}`, data);
  }

  // Update device target temperature
  async updateTargetTemperature(data) {
    const { mode } = data;

    // Delete mode from data
    delete data.mode;

    return this._put(`Mode/${mode}`, data);
  }

  /*
  | Support functions
  */

  // Perform GET request
  async _get(path) {
    path = `/api/v1/${path}`;

    this.log('GET', path);

    return this.get({ path, query: '', headers: {} });
  }

  // Perform PUT request
  async _put(path, json = null) {
    path = `/api/v1/${path}`;

    this.log('PUT', path);

    return this.put({ path, query: '', json, headers: {} });
  }

  /*
  | Client events
  */

  // Client initialized
  async onInit() {
    this.log('Initialized');
  }

  // Client destroyed
  async onUninit() {
    this.log('Destroyed');
  }

  async onBuildRequest(request) {
    const result = await super.onBuildRequest(request);
    const url = new URL(result.url);
    if (url.origin !== this.constructor.API_URL) throw new Error('Refusing an unexpected SENZ API URL');
    Object.assign(result.opts, { agent, timeout: 30000, redirect: 'error' });
    return result;
  }

  // The OAuth2 library sends token requests separately from onBuildRequest.
  async requestToken(parameters, responseHandler, errorHandler) {
    const body = new URLSearchParams(parameters);
    const response = await serviceFetch(this._tokenUrl, { method: 'POST', body });
    if (!response.ok) return this[errorHandler]({ response });
    this._token = await this[responseHandler]({ response });
    return this.getToken();
  }

  async onGetTokenByCode({ code }) {
    return this.requestToken({
      grant_type: 'authorization_code',
      client_id: this._clientId,
      client_secret: this._clientSecret,
      code,
      redirect_uri: this._redirectUrl,
    }, 'onHandleGetTokenByCodeResponse', 'onHandleGetTokenByCodeError');
  }

  async onGetTokenByCredentials({ username, password }) {
    const parameters = {
      grant_type: 'password', username, password, scope: this._scopes.join(' '),
    };
    if (this._clientId) parameters.client_id = this._clientId;
    if (this._clientSecret) parameters.client_secret = this._clientSecret;
    return this.requestToken(parameters, 'onHandleGetTokenByCredentialsResponse', 'onHandleGetTokenByCredentialsError');
  }

  async onRefreshToken() {
    const token = this.getToken();
    if (!token) throw new OAuth2Error('Missing Token');
    if (!token.isRefreshable()) throw new OAuth2Error('Token cannot be refreshed');
    const result = await this.requestToken({
      grant_type: 'refresh_token',
      client_id: this._clientId,
      client_secret: this._clientSecret,
      refresh_token: token.refresh_token,
    }, 'onHandleRefreshTokenResponse', 'onHandleRefreshTokenError');
    this.save();
    return result;
  }

  // Request response is not OK
  async onHandleNotOK({ body, status, statusText, headers }) {
    this.error('Request not OK', status, statusText);

    let error;

    // Client errors
    if ([401, 403, 404].includes(status)) {
      error = new Error(this.homey.__(`error.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      error = new Error(this.homey.__('error.50x'));
    }

    // Custom error message
    const messages = body?.messages || body?.Messages;

    const message = Array.isArray(messages) ? messages[0] : messages;
    if (typeof message === 'string' && filled(message)) {
      error = new Error(message);
    }

    // Unknown error
    if (blank(error)) {
      error = new Error(this.homey.__('error.unknown'));
    }

    error.status = status;
    error.statusText = statusText;

    return error;
  }

  // Handle result
  async onHandleResult({ result, status, statusText, headers }) {
    if (blank(result) || typeof result === 'object') {
      if (filled(result)) {
        this.log('[Response] Received');
      }

      return result;
    }

    this.error('[Response]', result);

    throw new Error(this.homey.__('error.50x'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('[Request]', err.code || err.type || err.name);

    const error = new Error(this.homey.__('error.network'));
    error.cause = err;
    throw error;
  }

}

module.exports = Client;
