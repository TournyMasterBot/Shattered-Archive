# Python User Script Bridge

## Provided Module
Your script automatically receives:

```python
from dsl_bridge import log, error, sendCommand, httpGet, httpGetJson, event
```

## Example
```python
log("Python script running")

repo = httpGetJson("https://api.github.com/repos/octocat/hello-world")
log(str(repo))

sendCommand("look")
```
