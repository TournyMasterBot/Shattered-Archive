# Lua User Script Bridge

## Injected Globals
- **log(message)** — Print a log message
- **sendCommand(text)** — Send text to the MUD
- **event** — Table describing trigger/alias/timer context
- **httpGet(url)** — Returns text response
- **httpGetJson(url)** — Returns Lua table

## Example
```lua
log("Lua running!")

local data = httpGetJson("https://api.github.com/repos/octocat/hello-world")

log("Repo full name: " .. data.full_name)

sendCommand("say Hello from Lua!")
```
