# JavaScript User Script Bridge

## Available APIs
- **log(message)** — Write to script console.
- **error(message)** — Write an error message.
- **sendCommand(text)** — Send a command to the MUD.
- **event** — Current trigger/alias/timer event context.
- **httpGet(url)** — Fetch raw text from a URL.
- **httpGetJson(url)** — Fetch JSON from a URL.

## Example
```javascript
log("JS running!");
const data = await httpGetJson("https://api.github.com");
log(JSON.stringify(data));
sendCommand("say Hello from JS!");
```
