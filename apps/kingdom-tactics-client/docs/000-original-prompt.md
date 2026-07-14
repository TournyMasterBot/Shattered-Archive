# Kingdom Tactics — Original Commissioning Prompt

> Saved verbatim on 2026-07-04. This is the founding brief for the `kingdom-tactics`
> application. Treat it as the authoritative statement of intent; when a design
> decision is ambiguous, re-read this before guessing.

---

I would like to create a new app in the style of the game-client / game-server,
web-client / web-server setup that is labeled as 'kingdom-tactics'

apps path, C:\Projects\ShatteredArchive\apps

I want this to be properly integrated into my docker-compose / docker setup in
C:\Projects\ShatteredArchive\deploy\docker-compose.shattered-archive-experimental.yml
though I do not wish to add this to the production deploy at this time.

I want to create a game mechanically similar to tactics arena online,
https://tactics-beta.taorankings.com/online.html#lobby
https://strategywiki.org/wiki/Tactics_Arena_Online/Units

There is a simple arena selector where you can play against an opponent in a mini
arena, where troops can be selected and act as a bit of a variant on chess in how
they can move and attack in one or more tiles.

Ultimately I would like to support a computer opponent and online multiplayer play,
and scenario exploration where the single player controls both sides to try and
work out strategies.

I want to support races, classes, kingdoms, and clans of DSL, not of the tactics arena.

Many of these races, classes, affiliations, religions are defined in
C:\Projects\DSL\Server\Server.Core\Constants.cs

The moons are a very important aspect of magi, base classes and reclasses are also
an important aspect of the game.

The intent is that the player can play as a general, managing deployed units to
strategically represent a single battle in a larger war. Cumulative battles will
long term be tracked but not for the initial implementation.

Ensure interfaces are utilized, that jest mocks / tests can be done, that items can
be tested in isolation and the components are created in carve outs to best implement
DRY principles. Save this initial prompt in a documentation folder inside the new
apps/ creation, start by planning out what you intend to do so that if usage is
exceeded, or if aspects should be handed off to qwen coder for implementation to save
on tokens we can do so.

Be sure to create simulators that utilize centralized information, so that if I change
or balance a race, class, etc. it will automatically flow through to the simulators.
