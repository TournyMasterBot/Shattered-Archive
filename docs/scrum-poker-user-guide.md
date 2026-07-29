# Scrum Poker — User Guide

**https://scrum-poker.shatteredarchive.dev**

Estimate stories together without anyone anchoring on the first number said out loud.
Everyone picks a card privately, then all the cards turn over at once.

There is nothing to install and nothing to sign up for.

---

## Quick start

**If someone sent you a link:** open it, type your name, click **Join room**. That's it.

**If you're running the session:**

1. Go to https://scrum-poker.shatteredarchive.dev
2. Optionally give the room a name (e.g. *Platform Team*) and adjust the cards
3. Click **Create room**
4. Click **Copy invite link** in the top right and paste it into your team chat

You are the room's **organizer**, which matters for one thing only: you can change the
room's settings. Everything else, anyone can do.

---

## Running an estimate

| Step | What happens |
|---|---|
| Read out the story | Everyone is looking at the same room |
| Everyone picks a card | Others see a ✓ next to your name — **not your number** |
| Click **Show estimates** | Every card flips over at once |
| Discuss the outliers | Average, median and a breakdown appear underneath |
| Click **Reset estimates** | Cards clear, ready for the next story. Nobody has to rejoin |

Changed your mind before the reveal? Click your card again to take it back, or click a
different one.

### Reading the estimate column

| You see | It means |
|---|---|
| **—** | Hasn't picked a card yet |
| **✓** | Has picked — hidden until the reveal |
| **5** | The actual estimate (after the reveal) |

You always see your own card, even before the reveal, so you can tell what you picked.

### After the reveal

- **Average** and **Median** — calculated from the numeric cards only
- **Consensus** — shown when everyone picked the same card
- **A breakdown** — e.g. `3 ×2` `5 ×4`, so you can see the split at a glance

`?` and `☕` are never counted in the average or median. `?` means "I can't estimate this
yet" and `☕` means "I need a break" — folding those into a number would quietly distort it.

---

## The buttons

| Button | What it does |
|---|---|
| **Show / Hide estimates** | Flips all cards over, or hides them again |
| **Reset estimates** | Clears every card for the next story. People stay in the room |
| **Clear all users** | Empties the name list. Anyone with the page still open reappears straight away; stale names don't |
| **Room settings** | Organizer only — see below |
| **Copy invite link** | Puts the room link on your clipboard |
| **☾ / ☀** | Switches between light and dark mode |

**When would I use "Clear all users"?** When the list has collected names of people who
have long since closed the tab. It's the tidy-up button, not a way to remove someone from a
live session.

---

## Room settings (organizer only)

Click **Room settings**.

| Setting | What it's for |
|---|---|
| **Room name** | A label in the header, e.g. *Platform Team*. The invite link never changes |
| **Estimate cards** | Your scale, comma-separated. `1,2,3,5,8` or `XS,S,M,L,XL` — whatever your team uses |
| **Hide estimates until revealed** | On by default. Turn it off for a room where anchoring doesn't matter |
| **Let anyone show/hide, reset, or clear** | On by default. Turn off to keep a control to yourself |
| **Show the average / median** | Turn off whichever number your team doesn't want to argue with |

If you change the cards mid-session, any estimate that's no longer on the new scale is
cleared, so nobody is left holding a card that doesn't exist.

**Why can't I open Room settings?** Only the browser that created the room can. See below.

---

## Things worth knowing

**Your name disappears after an hour of doing nothing.** The list shows who's *actually*
here, so anyone who has gone quiet for an hour drops off. You'll see a message with a
**Rejoin** button — one click and you're back, and nothing else about the room changes.
Clicking cards, revealing, or resetting all count as activity; simply leaving the tab open
does not.

**Refreshing or losing wi-fi is safe.** You come back to the same seat with your card
intact. The page reconnects on its own.

**Anyone with the link can join.** There are no accounts and no passwords, so treat the link
the way you'd treat a meeting invite. Don't put anything confidential in a room name.

**Being the organizer lives in your browser.** It's remembered on the device where you
created the room, so it won't follow you to another machine or survive clearing your site
data. If it's lost, the room keeps working perfectly — it just no longer has anyone who can
change its settings. Create a fresh room if you need to adjust things.

**Rooms look after themselves.** A room nobody has touched for a month is deleted, and one
that was created but never joined is cleaned up after a day. Nothing to tidy up manually.

---

## If something looks wrong

| What you see | What to do |
|---|---|
| **"No room with that link"** | Check the link is complete. A room deleted after a month of inactivity can't be recovered — create a new one |
| **"Connection lost — reconnecting…"** | Nothing. It retries by itself. Reload the page if it persists |
| **"You were removed after an hour…"** | Click **Rejoin** |
| **A button is greyed out** | Hover it — the tooltip says why. Usually the organizer has kept that control to themselves |
| **Someone's row is stuck at ✓** | That's correct before the reveal — it means they've voted. Click **Show estimates** |

Anything else, or something behaving oddly? Grab the room link and the rough time, and pass
it to whoever looks after the Shattered Archive stack.

---

*Technical documentation — architecture, API, deployment, configuration — lives in
[`docs/scrum-poker.md`](./scrum-poker.md).*
