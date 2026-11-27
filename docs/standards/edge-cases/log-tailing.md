---
topic: "Following growing, rotated or gated log files (jsonl)"
prefix: LOGTAIL
applies-when: "tail, follow, watch a log, jsonl, game-server logs, log rotation, offset checkpoint, SOH gate, GameLogs"
---

### LOGTAIL-01 A tail loses or duplicates records at partial lines, rotation and date boundaries
- Applies when: code follows a growing file or folder of jsonl logs.
- Edge case: a half-written last line is parsed and dropped; a restart re-reads or skips the file; the file for a date lives in the previous day's folder (`2026/11/05/server.log-2026-11-06.jsonl`), so a path built from the date misses it; the folder also holds the same data in another format (a plain-text `server-<date>.log` beside each `.jsonl`) and a listing by "everything in the folder" reads it as malformed records.
- Required behaviour: only complete lines are consumed; a checkpoint (path plus byte offset) is kept per file; files are discovered by listing the folder, not by building a name from the date, and only files with the log's own extension are read; a file that shrinks resets its checkpoint.
- Verify: tests that append a partial line then the rest, rename and recreate the file, restart mid-file, and use a folder date different from the filename date; assert every record is seen exactly once. Put the plain-text twin beside the log and assert it yields no event and no malformed line.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot

### LOGTAIL-03 A rotated file is read again as a new file, or a replaced file is skipped
- Applies when: a followed file can be renamed (`x.jsonl` to `x.1.jsonl`) or replaced by a fresh file of the same name, and checkpoints are keyed by path.
- Edge case: the rotated file appears under a new name with no checkpoint, so all of it is delivered again; or a new file at the old name is larger than the old offset, so the "shrunk" test does not fire and its first bytes are skipped.
- Required behaviour: keep a fingerprint of the consumed prefix (a hash of the first few hundred bytes) with the checkpoint. A new name whose prefix matches an old checkpoint inherits its offset; a name whose prefix no longer matches restarts at 0, however large it is. Do not rely on inode numbers (they are not stable through every bind mount).
- Verify: tests that rename a consumed file and create a fresh one at the old name (every line once, the old file's later growth still read), and that replace a file with a larger different one (read from byte 0).
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot

### LOGTAIL-02 A silent source is read as "nothing is happening"
- Applies when: the producer can stop logging without the activity stopping (the game-server's SOH gate stops raw and input logging).
- Edge case: the reader sees no events and concludes the player is idle, or keeps acting on state that is stale.
- Required behaviour: the reader tracks the age of the last event and marks its state stale after a stated limit; stale state never leads to an automatic action.
- Verify: a test with a controllable clock that advances with no events and asserts the state turns stale and auto-approval is refused.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot
