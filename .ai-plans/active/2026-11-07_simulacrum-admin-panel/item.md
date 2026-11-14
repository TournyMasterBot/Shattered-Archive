---
type: proposal
title: Simulacrum Admin - a local-only, simulacrum-only admin and debugging panel in the game client
slug: 2026-11-07_simulacrum-admin-panel
created: 2026-11-07
state: active
data-classification: personal
---

# Simulacrum Admin - a local-only, simulacrum-only admin and debugging panel in the game client

## Problem or opportunity

The owner administers and debugs the merc-mud instance (the `simulacrum` service) by reading raw game logs from the client and the
server, and by typing immortal commands by hand. They want to work entirely through a UI instead, without digging through raw logs.

## Proposed work

A second command, alongside the 'copilot' command being built in another window, named **Simulacrum Admin**. It adds a new UI panel
that supports informational debugging about the game and management of different aspects of the world.

In the owner's words:

- **Gating.** Enabled ONLY in the owner's local install, NEVER in production, and further gated so it is displayed ONLY when
  connected to the `simulacrum` service (the merc-mud instance).
- **Shape.** A UI panel with several tabs, similar in design to the auto-level wizard but with more free-form navigation. The modal is
  moveable and resizeable, and the owner can type in game while it is open.
- **Raw GMCP debug tab.** One tab to debug the raw GMCP being received from the mud.
- **Player management tab.** Target a player and execute immortal commands against that player with optional arguments. The commands
  are selectable from a list so the owner can see visually what is available.
- **Teleport.** When teleporting a player, the owner can select the destination from the area lists and from vnums specifically, in
  filterable ways, to quickly find where to move the player.
- **Full admin coverage.** This is admin power tooling: review the available administrative commands in full and create UI to support
  executing and debugging with them. Assume the owner works entirely with the UI.

## Who benefits

The owner, as the administrator and developer of the simulacrum (merc-mud) instance.

## Constraints and known unknowns

Constraints (stated by the owner):

- Must never be enabled in production; local install only.
- Must show only while connected to the `simulacrum` service.
- Must not block in-game typing while open; modal is moveable and resizeable.
- Another window is working on the 'copilot' command; this must be a sibling that does not collide with it.

Known unknowns (not yet answered):

- How "local install" and "production" are told apart for the gate, and how "connected to simulacrum" is detected.
- Which immortal/administrative commands exist and which of them the panel should cover (the owner asks for a full review).
- Where the area list and vnum data for the teleport picker comes from.
- What the panel should offer beyond the GMCP and player tabs; the owner expects several tabs for other aspects of the world.

## Related

- `.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot/` (copilot; its `tech-plan.md` is the named source of context and information)
- `apps/simulacrum-server` (gated relay onto merc-mud)
- The auto-level wizard in the game client (design reference for the tabbed panel)
