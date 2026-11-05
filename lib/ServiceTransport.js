'use strict';

const https = require('https');
const tls = require('tls');
const fetch = require('node-fetch');
const fetchCookie = require('fetch-cookie');
const WebSocket = require('ws');
const signalR = require('@microsoft/signalr');

const HOSTS = ['id.senzthermostat.chemelex.com', 'api.senzthermostat.chemelex.com'];
const EXPIRED_FINGERPRINT = '64:24:DB:CA:AC:70:F8:6A:8B:8F:36:38:5E:96:B1:48:EF:E8:7D:73:EA:00:BD:F1:A9:F5:16:BF:04:F5:AF:0C';
const WORKAROUND_UNTIL = Date.parse('2026-11-19T00:00:00Z');
const TIMEOUT = 30000;

function redact(message) {
  return String(message).replace(/([?&](?:access_token|token)=)[^&\s"'<>]+/gi, '$1[redacted]');
}

function assertServiceUrl(url, protocol = 'https:') {
  const parsed = new URL(url);
  if (parsed.protocol !== protocol || !HOSTS.includes(parsed.hostname)
    || (parsed.port && parsed.port !== '443') || parsed.username || parsed.password) {
    throw new Error('Refusing an unexpected SENZ service URL');
  }
}

class ServiceAgent extends https.Agent {

  constructor() {
    // A resumed TLS session may not expose the certificate needed for pinning.
    super({ maxCachedSessions: 0 });
  }

  validateSocket(socket, hostname, now = Date.now()) {
    if (socket.authorized) return null;

    const certificate = socket.getPeerCertificate();
    if (socket.authorizationError === 'CERT_HAS_EXPIRED'
      && HOSTS.includes(hostname)
      && now >= Date.parse(certificate.valid_to) && now < WORKAROUND_UNTIL
      && certificate.fingerprint256 === EXPIRED_FINGERPRINT) {
      return tls.checkServerIdentity(hostname, certificate) || null;
    }

    const error = new Error(`SENZ TLS validation failed: ${socket.authorizationError}`);
    error.code = socket.authorizationError;
    return error;
  }

  createConnection(options, callback) {
    // Delay handing the socket to HTTPS until validation/pinning succeeds, so no
    // HTTP headers, credentials or body can be sent over an unverified socket.
    const socket = tls.connect({ ...options, rejectUnauthorized: false });
    let finished = false;
    const onTimeout = () => socket.destroy(new Error('SENZ TLS handshake timed out'));
    const finish = (error) => {
      if (finished) return;
      finished = true;
      socket.removeListener('error', finish);
      socket.removeListener('timeout', onTimeout);
      socket.setTimeout(0);
      if (error) socket.destroy();
      callback(error, error ? undefined : socket);
    };

    socket.once('error', finish);
    socket.setTimeout(TIMEOUT, onTimeout);
    socket.once('secureConnect', () => {
      finish(this.validateSocket(socket, options.servername || options.host));
    });
  }

}

const agent = new ServiceAgent();

function serviceFetch(url, options = {}) {
  assertServiceUrl(url);
  return fetch(url, { ...options, agent, redirect: 'error', timeout: options.timeout || TIMEOUT });
}

class ServiceHttpClient extends signalR.HttpClient {

  constructor() {
    super();
    this.jar = new fetchCookie.toughCookie.CookieJar();
    this.fetch = fetchCookie(serviceFetch, this.jar);
  }

  async send(request) {
    if (request.abortSignal && request.abortSignal.aborted) throw new signalR.AbortError();

    const controller = new AbortController();
    let cancellation;
    if (request.abortSignal) request.abortSignal.onabort = () => {
      cancellation = new signalR.AbortError();
      controller.abort();
    };

    const timeout = setTimeout(() => {
      cancellation = new signalR.TimeoutError();
      controller.abort();
    }, request.timeout || TIMEOUT);
    try {
      const binary = request.content instanceof ArrayBuffer;
      const response = await this.fetch(request.url, {
        method: request.method,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(request.content ? { 'Content-Type': binary ? 'application/octet-stream' : 'text/plain;charset=UTF-8' } : {}),
          ...request.headers,
        },
        body: binary ? Buffer.from(request.content) : request.content || undefined,
        signal: controller.signal,
        redirect: 'error',
        timeout: request.timeout || TIMEOUT,
      });
      if (!response.ok) throw new signalR.HttpError(response.statusText, response.status);
      const content = request.responseType === 'arraybuffer' ? await response.arrayBuffer() : await response.text();
      return new signalR.HttpResponse(response.status, response.statusText, content);
    } catch (error) {
      throw cancellation || error;
    } finally {
      clearTimeout(timeout);
      if (request.abortSignal) request.abortSignal.onabort = null;
    }
  }

  getCookieString(url) {
    return this.jar.getCookieStringSync(url.replace(/^ws/, 'http'));
  }

}

class ServiceWebSocket extends WebSocket {

  constructor(url, protocols, options = {}) {
    assertServiceUrl(url, 'wss:');
    super(url, protocols, { ...options, agent, followRedirects: false, handshakeTimeout: TIMEOUT });
  }

}

module.exports = {
  agent,
  redact,
  serviceFetch,
  ServiceAgent,
  createSignalROptions: () => ({
    httpClient: new ServiceHttpClient(),
    WebSocket: ServiceWebSocket,
    // Both transports use the validated agent; EventSource has no agent hook.
    transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
    timeout: TIMEOUT,
  }),
};
