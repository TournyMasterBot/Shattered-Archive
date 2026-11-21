---
topic: "Long-running automation loops (autopilot): backstop timers, waits, retries and what ends a run"
prefix: RUNLOOP
applies-when: "autopilot, auto-leveling engine, run loop, round loop, backstop timeout, idleTimeoutMs, pause and resume, stop, retry, re-arm a buff, lap wait, delay between rounds, command queue and lag"
---

### RUNLOOP-01 An outer fatal timer is shorter than the inner timeout it backs up, and ignores lag the engine queued itself
- Applies when: an automation wraps a lower layer that has its own timeout, and an outer timer can end the run.
- Edge case: the movement backstop is `idleTimeoutMs`, 1000 ms by default (`autoleveling-engine.ts`, `waitForMovement`), while the movement tracker's own head-of-queue timeout is 1200 ms (`movementTracker.ts`). A reply delayed by the buff casts the engine had just queued ended the whole run with "Movement timed out".
- Required behaviour: the outer timer is longer than the inner timeout plus the lag the engine itself queued (known ability lag of recent sends). Expiry pauses the run with a visible reason so the player can resume; it does not end it.
- Verify: a test with a reply delayed past the old backstop but inside the lag allowance asserts the run continues; a test with no reply at all asserts the run pauses (status `paused`, reason shown), is not `error`, and resumes with a resync.
- Origin: 2026-11-18_autopilot-live-test-findings

### RUNLOOP-02 A long wait inside a run loop cannot be interrupted by Stop or Pause
- Applies when: a loop waits with a plain timer (`setTimeout` wrapped in a promise) for longer than a few seconds, such as the pause between laps.
- Edge case: `delayMs` cannot be cancelled. At 3 s that is harmless; at 3 minutes Stop leaves the engine "waiting" for up to 3 minutes, and a pause does not freeze the clock.
- Required behaviour: every wait longer than a few seconds is sliced (or listens for stop) so Stop ends it within a second; a pause freezes its remaining time and resumes it.
- Verify: a fake-timer test starts a multi-minute wait, calls stop, and asserts the run ends within one second of fake time; another pauses, advances the clock, resumes, and asserts the wait still has its remaining time.
- Origin: 2026-11-18_autopilot-live-test-findings

### RUNLOOP-03 A retry has no cap, no spacing and no single flight
- Applies when: code re-sends a command because its effect did not show (a buff that failed, an affect that dropped), or reacts to an event that can arrive many times in one moment.
- Edge case: affects dropped three or more at a time in 81 distinct seconds on 2026-11-14 (peak 13) and 102 on 2026-11-18 (peak 18). If each drop sends its own command the game queues them behind lag, the next movement reply is late, and the run stops.
- Required behaviour: one command is in flight at a time (a queue); a retry waits at least the ability's known lag; attempts are capped per drop and the engine gives up with one visible line; a failure that retrying cannot fix (no mana, no item left) is not retried.
- Verify: a test with 13 simultaneous drops asserts the sends are serial and spaced; a test with a cast that never takes effect asserts exactly the capped number of attempts and one give-up line; a test with the "no item" failure asserts no retry.
- Origin: 2026-11-18_autopilot-live-test-findings
