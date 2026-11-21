---
topic: "Tests that drive a client (browser, emulator, device) against an environment: which servers it really talks to"
prefix: TESTENV
applies-when: "emulator test, device test, Playwright or Maestro run, a client with a production default address, sign-in or cloud sync during a test, test accounts, adb, expo run, EXPO_PUBLIC settings, dev stack versus production"
---

### TESTENV-01 A client under test defaults to production when its environment settings are missing
- Applies when: a script or tool drives a browser, emulator or device test of a client that has a production default address (sign-in, cloud sync, an API base), or builds that client for the test.
- Edge case: the client is built or started without the dev settings, so a sign-in or a save in the test reaches a production account, while the features that default to the dev machine (maps, catalogs) appear to work against the dev server and hide the mistake.
- Required behaviour: the tool sets every origin the client will use explicitly, prints them, and refuses any that is not loopback, the emulator's alias for the host, or a dev name, before the first sign-in or write; a missing setting is a refusal, never a fallback to the client's default; writes and resets run only in the same session as a passing check.
- Verify: a unit test that resolves the origins from an empty environment and expects a refusal, and one with look-alike hosts (a production name inside a dev name, userinfo before a production host); and the dev server's own log showing the run's sign-in request while nothing reached production.
- Origin: 2026-11-20_mobile-emulator-test-harness

### TESTENV-02 A real certificate, key or capture copied into a test fixture carries the machine's names
- Applies when: a test needs a certificate, a hosts entry, a captured response or any other file taken from the local dev stack or the developer's machine, and the fixture is committed.
- Edge case: the fixture is copied from the local stack and holds the Windows account name and host name (mkcert writes both into every certificate it issues), a LAN address, or a key.
- Required behaviour: fixtures are synthetic: a certificate fixture is generated with a neutral subject and no key is kept; a captured response is rebuilt with placeholders. A known-answer value (a pin, a hash) is computed independently of the code under test.
- Verify: a test that parses every certificate fixture and asserts its subject and issuer hold no `user@host` pattern, no machine or tool-generated name, and that the file holds no private key.
- Origin: 2026-11-20_mobile-emulator-test-harness
