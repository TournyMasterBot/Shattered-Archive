# TypeScript User Script Bridge

TypeScript scripts are transpiled to JavaScript at runtime.

## Available APIs
Same as JavaScript:
- log(message)
- error(message)
- sendCommand(text)
- event
- httpGet(url)
- httpGetJson(url)

## Example
```ts
log("TS running!");

interface Repo {
  full_name: string;
}

const repo = await httpGetJson("https://api.github.com/repos/octocat/hello-world") as Repo;
log(repo.full_name);

sendCommand("look");
```
