# Temporary SENZ certificate workaround

The identity and API hosts both presented the same expired leaf certificate on
5 November 2026. Its validity ended at 23:59:59 UTC on 4 November 2026.

`lib/ServiceTransport.js` temporarily accepts **only** that certificate when:

- the TLS error is `CERT_HAS_EXPIRED`;
- the hostname is `id.senzthermostat.chemelex.com` or
  `api.senzthermostat.chemelex.com` and matches the certificate's subject names;
- the certificate SHA-256 fingerprint is
  `64:24:DB:CA:AC:70:F8:6A:8B:8F:36:38:5E:96:B1:48:EF:E8:7D:73:EA:00:BD:F1:A9:F5:16:BF:04:F5:AF:0C`;
- the current time is after the certificate's expiry and before
  **19 November 2026, 00:00 UTC**.

The agent validates the TLS socket before handing it to HTTP, so request headers
and credentials are withheld until validation succeeds. Other invalid certificates
remain rejected. Normally valid certificates, including a renewed certificate,
are accepted through normal TLS verification and do not need the old fingerprint.
TLS session caching is disabled to make the peer certificate available for pinning.
Global TLS settings and other applications are unaffected.

The transport covers authorization-code exchange, password grants, token refresh,
API calls, SignalR negotiation, WebSockets and long polling. Redirects are rejected
to keep credentials at the configured service. SignalR uses WebSockets with long
polling fallback; EventSource is excluded because its installed implementation does
not expose an HTTPS agent option. Session-affinity cookies are retained. The direct
`node-fetch`, `fetch-cookie` and `ws` dependencies were already present transitively;
they are declared explicitly because app code now imports them.

Browser login is outside the Homey app's TLS transport. A new login or repair can
still show a browser certificate error until the provider renews its certificate.
The app cannot remove that browser error. Existing sessions can refresh their tokens
using this workaround.

Once the provider renews the certificate, remove the fingerprint exception and
its cutoff. Do not extend the cutoff or replace the fingerprint without inspecting
the provider's certificate again. Retaining the transport is optional; it also
provides bounded requests, redirect protection and token-safe webhook logging.

## Local verification

Run `npm test`, `npm audit --omit=dev`, `homey app validate`,
`homey app validate --level publish`, and `git diff --check`.
The network-free regression tests cover the pin and time/hostname restrictions,
withholding the socket before validation, authentication handlers, request failure,
connectivity Flow transitions, migration and shutdown races.

## Homey smoke test

These steps require an authorized test build on Homey. Local tests and package
validation do not verify them.

1. Start the test build with an already paired SENZ thermostat. Check that startup
   and capability migration finish without errors and normal readings appear.
2. Allow an OAuth token refresh to occur, then confirm that polling still updates
   readings. Do not print or share tokens to force or diagnose this check.
3. Confirm the log reports a registered webhook. Change a supported mode or target
   temperature through the manufacturer's app and check that Homey updates promptly.
4. In Homey, change the target temperature while antifreeze is selected. Confirm the
   thermostat enters constant mode and receives the temperature. Restore the desired
   temperature afterward. Unsupported modes should show a useful error.
5. Simulate service/network loss in a controlled test, confirm devices become
   unavailable, then restore connectivity and confirm recovery. A rejected command
   must not leave an unconfirmed target/mode displayed as successful.
6. With existing legacy connectivity Flows, verify that offline/online transitions
   fire `connected_false`/`connected_true` once each and the `connected` condition
   matches connectivity. Initial unknown values should not fire a transition.
7. Restart or stop the app during polling or webhook startup. Check that there is
   only one poller and webhook after restart and no activity after shutdown.

For migration checks, use a test device that still has the old `connected`
capability. Confirm its boolean value is transferred before the old capability is
removed and repeating initialization does not repeat the migration.
