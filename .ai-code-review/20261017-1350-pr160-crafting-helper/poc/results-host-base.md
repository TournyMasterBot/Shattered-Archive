# HOST-1: core-plugin alias reachability against the BASE normalizer (ad565a6) - the dead-alias regression since b825d70

23 tests: **13 passed**, **10 failed** (2026-10-17T23:21:53.998Z)

## PluginHost.syncInstalled

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | keeps the running instance when the installed list changes for unrelated reasons |  |
| pass | re-registering a core plugin does not swap out the live instance |  |
| pass | refreshes config on a running plugin instead of rebuilding it |  |
| pass | still disables a plugin that was turned off, and re-enabling builds a fresh instance |  |

## PluginRuntimeApi.setHudWidget

3 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | publishes into the widget registry, owned by the plugin id |  |
| pass | clears every slot the plugin owns when the plugin is disabled |  |
| pass | disabling one plugin does not clear a slot owned by another plugin |  |

## PluginHost.tryExecuteAlias

1 passed, 1 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | reaches an enabled plugin's onAlias and lets it consume a command | Expected: true \| Received: false |
| pass | returns false, leaving the command unconsumed, when no enabled plugin matches |  |

## PluginHost.invokePluginAction

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | returns "ok" and calls the handler when one is registered |  |
| pass | returns "no-handler" and does not throw when no handler is registered for the key |  |
| pass | returns "no-handler" when the plugin was never enabled |  |
| pass | returns "error" (distinct from "no-handler") and does not throw when a registered handler throws |  |

## PluginHost.tryExecuteAlias — every core plugin that defines onAlias is reachable

1 passed, 9 failed

| result | test | first failure line |
|---|---|---|
| pass | covers the plugins known to define an alias handler (a rename or removal must be deliberate) |  |
| **FAIL** | brew: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | enchant: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | gourd: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | people: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | warlock-alphabet: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | questbot: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | text-to-speech: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | world-time-and-identity: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
| **FAIL** | crafting-helper: tryExecuteAlias hands typed input to its onAlias | Expected: true \| Received: false |
