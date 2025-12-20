# Command Shortcuts & Speedwalking Guide

This guide explains the **command shortcuts**, **repeaters**, and
**multi‑command chaining** available in the Shattered Archive client.

These features are designed for MUD players and behave similarly to
classic speedwalks and aliases found in long‑standing MUD clients.

------------------------------------------------------------------------

## Core Ideas

You can:

-   Send **multiple commands on one line**
-   **Repeat commands** or chains of commands
-   **Repeat the previous command chain**
-   **Clear the command stack** safely
-   Remap all special characters to what feels comfortable for you

All processing happens **locally first**, then commands are sent to the
MUD exactly as if you typed them manually.

------------------------------------------------------------------------

## 1. Command Splitter (`;` by default)

The **command split character** lets you type multiple commands on one
line.

### Example

    l;who;wave

### What gets sent to the server

    l
    who
    wave

### Notes

-   Commands are sent **in order**
-   Empty commands are preserved
-   The split character can be changed in **Accessibility → Command
    Input**

------------------------------------------------------------------------

## 2. Repeater (`#` by default)

The **repeater prefix** repeats each command segment independently.

### Example

    #3n;4n;8e

### Expansion

    n
    n
    n
    n
    n
    n
    n
    e
    e
    e
    e
    e
    e
    e
    e

### Example

    #5n;5e;5s;5w;5n

### Expansion

    n x5
    e x5
    s x5
    w x5
    n x5

### Notes

-   Each segment is handled **independently**
-   This is ideal for **speedwalking patterns**
-   Repeats are capped for safety : Limit 100

------------------------------------------------------------------------

## 3. Repeat‑Chain (`&` by default)

The **repeat‑chain prefix** repeats an **entire command sequence**.

### Example

    &10kill squirrel;where

### Expansion

    kill squirrel
    where
    kill squirrel
    where
    (repeated 10 times)

### Use Cases

-   Grinding mobs
-   Patrol routes
-   Combat + scan loops
-   Training repetitions
-   Moving crafting materials

### Key Difference vs Repeater

  Feature           `#` Repeater   `&` Repeat‑Chain
  ----------------- -------------- ------------------
  Scope             Per command    Entire chain
  Order preserved   Yes            Yes
  Typical use       Movement       Command Sequence Loops

------------------------------------------------------------------------

## 4. Clear Stack (`~` by default)

The **clear stack command** always sends a clear instruction to the
server.

### Example

    ~who

### What happens

    ~
    who

### Notes

-   The client **does not** clear local history
-   The server handles clearing its command stack
-   Any queued commands are cancelled immediately

------------------------------------------------------------------------

## 5. Empty Commands (Intentional)

Pressing **Enter on a blank line** still sends a command.

This preserves compatibility with MUDs that use blank input for:

-   Prompt refresh
-   Prevent voiding

------------------------------------------------------------------------

## 6. Customization (Accessibility Settings)

All special characters can be changed:

  Feature         Default
  --------------- ---------
  Command split   `;`
  Repeater        `#`
  Repeat‑chain    `&`
  Clear stack     `~`

You can remap these to whatever feels natural.

Examples:

-   Use `-` instead of `;`
-   Use `+` instead of `&`
-   Map `\` to send `~` to the server

------------------------------------------------------------------------

## 7. Safety Limits

To protect your connection:

-   Repeats are capped
-   Commands are queued, not recursive
-   Clearing the stack cancels pending commands immediately

------------------------------------------------------------------------

## Summary

You now have:

-   **Multi‑command lines**
-   **Speedwalking**
-   **Looped command chains**
-   **Safe server stack clearing**
-   **Fully customizable input**

All without scripting.

If you've used classic MUD clients before, this system should feel
familiar.

Happy adventuring.
