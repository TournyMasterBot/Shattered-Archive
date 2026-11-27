---
topic: "Opening, dropping, replacing and reopening a live connection, and the state tied to it"
prefix: CONNLIFE
applies-when: "WebSocket, TCP socket, connect, disconnect, reconnect, replaced socket, close event, connection state, session state, anything gated on being connected"
---

### CONNLIFE-01 A late event from a replaced socket is taken for the current connection's
- Applies when: code owns a socket that can be replaced (reconnect, switching servers) while the old one is still closing.
- Edge case: the old socket's close or error arrives after the new one has opened and flips the state to disconnected, so everything gated on the connection stays off on a live connection.
- Required behaviour: every socket handler first checks that its socket is still the current one; replacing a socket reports the end of the old session once, at the moment of replacement.
- Verify: a test connects, connects again, delivers the old socket's close after the new one has opened, and asserts the state stays connected and no further session end is reported.
- Origin: 2026-11-26_mobile-crafting-helper-port-and-hud-docks

### CONNLIFE-02 A flag learned during a session survives the drop and misleads the next one
- Applies when: a client keeps a flag or value learned from the server (away-from-keyboard, fighting, current room, queued state) and acts on it.
- Edge case: the connection drops while the flag is set; the next session never sends the update that would clear it, so the client stays suspended or acts on the old session's facts.
- Required behaviour: everything learned from a session is reset at its end, to the value used before anything is known.
- Verify: a test sets the flag, ends the session, connects again without sending the flag's data, and asserts the client behaves as before the flag was ever set.
- Origin: 2026-11-26_mobile-crafting-helper-port-and-hud-docks

### CONNLIFE-03 Per-connection data is switched after the connection event, so a listener reads the other connection’s data
- Applies when: code reacts to a connect or a close and reads something stored per connection or server (scripts, settings, variables), and that store is switched by a UI effect or another listener.
- Edge case: a custom server’s script set is swapped in or out just after the open and close events; a notice decided inside the listener read the not-connected set and spoke of timers the server does not have.
- Required behaviour: the listener captures what it needs while it is certainly the session’s own (at the drop), or acts after the switch announces itself.
- Verify: a test that changes the per-connection store between the drop and the reconnect and asserts the message or action follows the session that dropped.
- Origin: 2026-11-26_mobile-crafting-helper-port-and-hud-docks
