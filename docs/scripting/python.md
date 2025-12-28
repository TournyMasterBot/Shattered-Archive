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

## More Involved Example
```python
log("Python script starting up")

# Simple state
counter = 0
total = 0

# Simulate some work
for i in range(1, 6):
    counter += 1
    total += i

    log("Loop iteration", {
        "iteration": i,
        "counter": counter,
        "running_total": total,
    })

    # Every 2 iterations, emit a command
    if i % 2 == 0:
        cmd = "look"
        log("Issuing command to game", cmd)
        sendCommand(cmd)

# Conditional logging
if total > 10:
    log("Total exceeded threshold", total)
else:
    error("Total did not reach expected threshold", total)

# Demonstrate string formatting
player = "Adventurer"
level = 12
log("Player status: %s (level %d)" % (player, level))

# Optional async HTTP example (fire-and-forget)
try:
    httpGetJson("https://api.github.com/repos/TournyMasterBot/Shattered-Archive")
    log("Requested project metadata from GitHub API")
except:
    # Skulpt exceptions still route here if something goes wrong early
    error("Failed to initiate httpGetJson request")

log("Python script finished")
```