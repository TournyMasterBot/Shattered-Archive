# HOST-1: new normalizePluginModule tests against the PR-head field-by-field copy (8561e03)

7 tests: **6 passed**, **1 failed** (2026-10-17T23:21:40.623Z)

## normalizePluginModule

6 passed, 1 failed

| result | test | first failure line |
|---|---|---|
| pass | passes through a valid actions array unchanged |  |
| pass | drops a non-array actions value to undefined |  |
| pass | leaves actions undefined when the field is absent |  |
| pass | still passes through onAlias (the fix this file originally shipped for) |  |
| pass | passes every lifecycle / command hook through by reference |  |
| **FAIL** | does not drop a hook it has never heard of (a future IPluginModule field) | Expected: [Function onFutureHook] \| Received: undefined |
| pass | still normalizes manifest, assets and configSchema around the passthrough |  |
