// apps/game-client/src/features/plugins/core-plugins/text-to-speech.plugin.ts
//
// Text to Speech — reads text aloud via the browser's built-in
// speechSynthesis. Two independent, mutually exclusive targets (mirrors the
// play-area/page-items split in voice-dictation.plugin.ts):
//   - Play area: auto-reads incoming game lines as they arrive, skipping
//     anything already squelched (shouldOmitLine) plus user include/exclude
//     patterns. Lines within a short, debounced grouping window
//     (groupWindowMs, capped by MAX_GROUP_SPAN_MS) are joined with spaces
//     into one utterance, so bursts — room descriptions, combat rounds, or a
//     single paragraph the MUD word-wraps across several lines — read as one
//     flowing utterance instead of choppy, artificially-paused back-to-back
//     ones; queued and capped so a busy combat log can't build an
//     ever-growing backlog.
//   - Page items: a floating button that reads the current text selection
//     (or the focused element's text/value) aloud on demand, excluding the
//     play/command input.
//
// No separate "engine" plugin like STT has — this only uses the browser's
// built-in voices (no downloadable/advanced engine was asked for here), so
// voice/rate/pitch and both targets live in one config schema.
//
// A few more alert toggles piggyback on the same speech queue, independent of
// the play-area/page-items targets above:
//   - Health: announces when the player's or current opponent's health
//     crosses into a new condition tier (excellent / scratches / wounds /
//     hurt / awful), not on every hp change. Self health is raw GMCP numbers
//     (game:char-data) bucketed via self-condition-buckets.ts; enemy health
//     reuses the same tiers the combat log already parses (opponent-buckets.ts,
//     via event:fighting:opponent) so the wording matches what the enemy
//     HUD/log already show.
//   - Game tick: announces the server's tick event (game:tick — the same
//     heartbeat driving the tick timer HUD in tickStore.ts), optionally
//     including the in-game time carried on that same event payload
//     (payload.time) rather than a separate lookup.
//   - Battle Focus (play area only, Combat Mode = "Battle Focus"): a "game
//     caster" mode for the player's own fights — instead of reading every
//     individual combat line, calls out status effects, stuns/
//     incapacitation, disarms, deaths, and flees, dropping plain damage,
//     avoidance, mundane movement, item-use, named-attack cast flavor, and
//     weapon-flag procs as noise (all reused from Combat Compression's
//     pattern list regardless of that plugin's own toggles — this is meant
//     to be its own aggressive, self-contained filter). Shares its
//     classify-and-speak pipeline (speakArenaLineIfWorthy) with Arena
//     Observer Mode below, just applied to the normal play-area stream
//     instead of a room-gated one, and with condition-tier lines dropped
//     rather than spoken (that's "Announce self/enemy health changes"
//     above's job — speaking both was a double announcement of the same
//     tier change). Also listens for game:affect-added/removed (the same
//     GMCP feed the Affects panel uses) to call out self debuffs — stat
//     modifiers only (a modifier's sign says debuff vs buff, inverted for
//     ac's DSL/MERC convention), not stuns/charms/etc., which carry no sign
//     to read and stay on the text-pattern Incapacitation coverage instead.
//   - Stun alert: announces confirmed self-stuns (bash knockdown, trip),
//     reusing Stun Highlight's log-verified line matchers. Checked before the
//     shouldOmitLine squelch check on purpose, since Stun Highlight squelches
//     that exact original line through the same shared omit-rule store to
//     re-emit a recolored version — checking after it would silently break
//     this alert whenever Stun Highlight is also enabled.
//   - Arena observer mode: a "game caster" mode covering both DSL arena
//     types (Coliseum spectator broadcast, Bloodbath participant feed) —
//     see handleArenaLine's own doc comment below for the full pipeline.

import type { IPluginModule, PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { shouldOmitLine } from '../../userScripts/triggerOmitStore';
import { OPPONENT_BUCKETS } from '../../combat/opponent-buckets';
import { SELF_CONDITION_BUCKETS } from '../../combat/self-condition-buckets';
import { PATTERNS as COMBAT_PATTERNS } from './combat-compression.plugin';
import { PATTERNS as WEAPON_FLAG_PATTERNS } from './weapon-flag-squelch.plugin';
import { classifyStrictChatSubtype } from '../../chat/strict-chat-classifier';

const COMMAND_INPUT_ID = 'game-command-input';
const READ_BUTTON_ID = 'text-to-speech-read-btn';
const STOP_BUTTON_ID = 'text-to-speech-stop-btn';

const FLOATING_BUTTON_CSS = `
#${READ_BUTTON_ID}, #${STOP_BUTTON_ID} {
  position: fixed;
  left: 16px;
  z-index: 500;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #555;
  background: #1a1a1a;
  color: #f0f0f0;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
#${READ_BUTTON_ID} { bottom: 16px; }
#${STOP_BUTTON_ID} { bottom: 64px; }
#${READ_BUTTON_ID}:hover, #${STOP_BUTTON_ID}:hover { background: #242424; }
`;

// Browsers report speechSynthesis voices asynchronously (often empty until a
// 'voiceschanged' event fires shortly after page load), but configSchema.fields
// options are a static array read once when the config modal opens (see
// PluginConfigModal.tsx — schema comes from a fresh create() call per open,
// not re-read live). Caching at module scope and subscribing to
// 'voiceschanged' once means the cache is very likely warm — even on the
// very first modal open in a session, since this file is imported (and this
// module evaluated) well before the user opens Configure — without needing
// PluginConfigModal itself to support live-refreshing field options.
let cachedVoices: SpeechSynthesisVoice[] = [];
let voiceChangeListenerAttached = false;

function refreshVoiceCache(): SpeechSynthesisVoice[] {
  const Synth = window.speechSynthesis;
  if (!Synth) return cachedVoices;

  const voices = Synth.getVoices();
  if (voices.length > 0) cachedVoices = voices;

  if (!voiceChangeListenerAttached) {
    voiceChangeListenerAttached = true;
    Synth.addEventListener('voiceschanged', () => {
      cachedVoices = Synth.getVoices();
    });
  }

  return cachedVoices;
}

function voiceSelectOptions(): Array<{ value: string; label: string }> {
  const options = [{ value: '', label: '(Browser default)' }];
  for (const v of refreshVoiceCache()) {
    options.push({ value: v.name, label: `${v.name} (${v.lang})` });
  }
  return options;
}

refreshVoiceCache();

function parsePatterns(raw: unknown): string[] {
  return String(raw ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// The PROMPT command (see the in-game HELP PROMPT file) lets every player
// build their own status line from %h/%H/%m/%M/%v/%V/etc. tokens, so the
// literal text is different per player/session — a substring exclude can't
// catch it generically. Every variant still packs the same vitals cluster
// (hp plus mana and/or moves, each optionally current/max) tightly together,
// which ordinary narrative text does not, so that shape is what's detected
// instead of any specific format.
const PROMPT_HP_RE = /\d+(?:\/\d+)?\s*hp\b/i;
const PROMPT_MANA_RE = /\d+(?:\/\d+)?\s*m(?:ana)?\b/i;
const PROMPT_MOVES_RE = /\d+(?:\/\d+)?\s*mv\b/i;

function looksLikePromptLine(line: string): boolean {
  if (!PROMPT_HP_RE.test(line)) return false;
  return PROMPT_MANA_RE.test(line) || PROMPT_MOVES_RE.test(line);
}

// Each pattern line is tried as a regex first (case-insensitive) so power
// users get real pattern matching (anchors, alternation, character classes),
// not just a literal substring. Falls back to a literal substring test only
// if the line doesn't compile as a regex at all (e.g. an unbalanced paren) —
// existing plain-word patterns ("misses", "HP:") compile fine as regex and
// behave identically either way, so this is backward compatible in practice.
function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p, 'i').test(text);
    } catch {
      return text.toLowerCase().includes(p.toLowerCase());
    }
  });
}

// Buckets are declared as disjoint integer ranges (90-99, 75-89, ...), but
// hp/hpMax*100 is essentially never a clean integer in real play — a
// bucket.min/max range check (pct >= b.min && pct <= b.max) leaves every
// fractional value between one tier's max and the next tier's min (e.g.
// 89.4%, 99.7%) matching NOTHING at all, silently skipping the alert.
// Buckets are declared highest-min-first (100, 90, 75, 50, 30, 15, 0), so
// the first tier whose min the pct clears is correct on its own — no upper
// bound needed, and no gap left uncovered.
function bucketForPct<T extends { min: number; max: number }>(buckets: T[], pct: number): T | undefined {
  return buckets.find((b) => pct >= b.min);
}

// Condition lines repeat verbatim every time the game re-sends the same
// tier (e.g. four straight "An air elemental has a few scratches." lines
// before it actually drops a tier) — with no dedup, compressed speech was
// reading the identical sentence over and over instead of just the tier
// CHANGES. min/max here double as the dedup key alongside the subject below.
const ALL_CONDITION_BUCKETS = [...OPPONENT_BUCKETS, ...SELF_CONDITION_BUCKETS];

function matchConditionBucket(line: string): { phrase: string; min: number; max: number } | null {
  return ALL_CONDITION_BUCKETS.find((b) => line.includes(b.phrase)) ?? null;
}

// Bucket phrases are inconsistent about including their own verb (compare
// OPPONENT_BUCKETS' "a few scratches." — no "has" — against its neighbors,
// which all include one), so the subject can't be reliably derived by just
// slicing the line up to the matched phrase. Matching the verb directly off
// the line itself instead works for both self ("You have/are ...") and
// third-person ("An air elemental has/looks ...") forms.
const CONDITION_SUBJECT_RE = /^([\w\-\s,']+?) (?:has|have|is|are|looks|look)\b/;

function conditionSubject(line: string): string {
  const m = line.match(CONDITION_SUBJECT_RE);
  return m ? m[1].trim() : 'You';
}

// Same idea for weapon-flag proc echoes (Frost/Flaming/Shocking/etc. flavor
// lines) — reuse weapon-flag-squelch.plugin.ts's verified patterns rather
// than a second copy. This only affects what text-to-speech reads aloud in
// compressed mode; it does not touch the terminal (that plugin's own
// suppression toggles are unrelated to this one).
const WEAPON_FLAG_RES = WEAPON_FLAG_PATTERNS.map((p) => new RegExp(p.pattern, 'm'));

function isWeaponFlagLine(line: string): boolean {
  return WEAPON_FLAG_RES.some((re) => re.test(line));
}

// Arena Observer Mode — a spectator feature, not a participant one. The
// DSL Coliseum broadcasts every room's activity to onlookers with an
// explicit "[ Room Name ] " prefix on each line (confirmed via
// C:\Projects\DSL\AGL\Text\2024-02-17_Piknim_Pardo.txt and cross-checked
// against the full server log corpus, 2026-07-21). Only these five rooms
// carry that prefix; nothing else does, which is what makes "only speak
// arena lines" a simple prefix check rather than needing real room-tracking
// state.
const ARENA_ROOM_PREFIXES = [
  'Eastern Coliseum Wall',
  'Western Coliseum Wall',
  'Northern Coliseum Wall',
  'Southern Coliseum Wall',
  'The Center of the Coliseum',
].map((r) => `[ ${r} ] `);

function stripArenaPrefix(line: string): string | null {
  for (const p of ARENA_ROOM_PREFIXES) {
    if (line.startsWith(p)) return line.slice(p.length);
  }
  return null;
}

// Squelched unconditionally in arena mode regardless of Combat Compression's
// own toggles (same self-contained-filter precedent as Battle Focus mode
// above): Damage (plain hit/miss spam — there's no "you" to summarize for,
// the listener is a spectator/isn't meant to hear every blow), Avoidance,
// Ambient, Item Use, Attack Flavor (named special-attack casts with no
// debuff/buff info of their own — "just a blow, reskinned"), UI Noise
// (command echoes, scan/group/affects listings — only relevant to the
// Bloodbath path below, since the Coliseum feed never contains this), and
// weapon-flag procs (2026-07-21 refinement: initially left audible, but
// confirmed extremely common/noisy in both arena corpora — squelched now).
// Also failed disarm/escape attempts (nothing happened). Deliberately NOT
// squelched: Status (buffs/debuffs), Incapacitation, Disarm (success),
// Death, Flee/Rescue (minus the panic no-op above), and everything NOT
// matched by any pattern at all — a rare/unusual event a "game caster"
// would call out as a highlight, per the explicit ask: debuffs/stuns/
// debilitating things are the priority, buffs are fine too, but this is
// deliberately not an allowlist-only filter.
const ARENA_SQUELCH_RES = COMBAT_PATTERNS.filter(
  (p) =>
    p.categoryLabel === 'Damage' ||
    p.categoryLabel === 'Avoidance' ||
    p.categoryLabel === 'Ambient' ||
    p.categoryLabel === 'Item Use' ||
    p.categoryLabel === 'Attack Flavor' ||
    p.categoryLabel === 'UI Noise' ||
    p.configKey === 'squelchDisarmFail' ||
    p.configKey === 'squelchFleePanic',
).map((p) => new RegExp(p.pattern, 'm'));

function isArenaSquelchLine(line: string): boolean {
  return ARENA_SQUELCH_RES.some((re) => re.test(line)) || isWeaponFlagLine(line);
}

// Bloodbath Arena — the OTHER arena type, structurally opposite the
// Coliseum: no spectator broadcast prefix at all. The player is a direct
// participant physically inside a single room (all cells of its maze share
// the literal name "The Bloodbath Arena"), so the raw feed is just normal
// client output — the standard prompt line, full room-look renders
// (title/description/exits/contents) on every re-entry, and ordinary
// command echoes — mixed in with the actual fight. Confirmed via
// C:\Projects\DSL\GameLogs\GameLog-DSL_2023-11-10-Fri.txt and cross-checked
// against the full server log corpus, 2026-07-21.
const BLOODBATH_ROOM_NAME = 'The Bloodbath Arena';
const BLOODBATH_ROOM_DESC = 'Blood and various peices of flesh adorn the arena grounds here.';

// Standard vitals-prompt line: "<1674/1674hp 1149/1186m 406/406mv 972527tnl>
// [Room Name] [exits] [time]". Doubles as both the current-room signal AND
// the terminator for a room-look render block below — simpler and more
// self-contained than cross-referencing a separate GMCP room event against
// this text stream's own timing.
const BLOODBATH_PROMPT_RE = /<\d+\/\d+hp\s+\d+\/\d+m\s+\d+\/\d+mv\s+\d+tnl>\s*\[([^\]]*)\]/;
const EXITS_LINE_RE = /^\s*\[Exits:.*\]\s*$/;

// Weapon-flag procs and other left-audible lines still repeat near-verbatim
// round after round against the same target (confirmed in the sample fight
// — "A grand arcanium whip draws life from Pardo." fires on nearly every
// hit) — real duplication, just not literal/hash duplication, since only
// the names differ. Canonicalizing by blanking digits and proper-noun runs
// turns that into an exact-match problem: comparing only against the last
// SPOKEN shape (not a full history) means a genuinely repeating effect goes
// quiet after its first mention, but starts announcing again the moment
// something else interrupts the streak — it's not permanently silenced.
const ARENA_STOPWORDS = new Set(['You', 'Your', 'The', 'A', 'An', 'It', 'Someone', 'Something']);

function canonicalizeArenaLine(line: string): string {
  let s = line.replace(/\d+/g, '#');
  s = s.replace(/\b[A-Z][a-zA-Z']*\b/g, (w) => (ARENA_STOPWORDS.has(w) ? w : '<N>'));
  s = s.replace(/(<N>[\s,'-]*)+/g, '<N> ');
  return s.replace(/\s+/g, ' ').trim();
}

// Confirmed self-stun lines from stun-highlight.plugin.ts's log-verified
// corpus (red category only — a real stun landing on the player; the yellow
// "attacker tripped over their own missed bash" variants are about the
// OTHER combatant, not something to alert the player about here).
const SELF_STUN_MATCHERS = ['You are sent flying by the impact!', 'trips you and you go down!'];

function isSelfStunLine(line: string): boolean {
  return SELF_STUN_MATCHERS.some((m) => line.includes(m));
}

// Battle Focus mode's self-affects channel: game:affect-added/removed
// (AffectData: n=name, m=modifier, lc=location, matching useAffectsBlock.ts
// and the Affects panel) has no explicit good/bad flag, so direction is
// inferred from the modifier's sign — except "ac", where DSL/MERC convention
// inverts it (a HIGHER ac value is worse defense, so a positive modifier
// there is the debuff, not a negative one). A zero modifier (stuns, charms,
// and other binary flag-style affects) carries no sign to read at all, so
// it's left alone rather than guessed at — those come from the text-pattern
// Incapacitation coverage instead.
function isAffectDebuff(modifier: number, location: string): boolean {
  if (modifier === 0) return false;
  return location.trim().toLowerCase() === 'ac' ? modifier > 0 : modifier < 0;
}

// Hard safety valve on the debounced group window below — bounds how far
// speech can lag behind the game during a sustained burst (heavy combat spam
// that never leaves a groupWindowMs gap). Not user-configurable; it only
// matters when a burst runs long, unlike groupWindowMs which shapes the
// common case.
const MAX_GROUP_SPAN_MS = 1500;

// volume=0 makes the actual text inaudible — only its presence/duration
// matters (see the primer-utterance comment in pump() below) — but a
// single space risks some engines collapsing it to zero duration and
// defeating the point, so this is a short throwaway word instead.
const PRIMER_UTTERANCE_TEXT = 'hm';

export function createTextToSpeechPlugin(): IPluginModule {
  let queue: string[] = [];
  let speaking = false;
  let readButton: HTMLButtonElement | null = null;
  let stopButton: HTMLButtonElement | null = null;
  let pendingLines: string[] = [];
  let groupTimer: ReturnType<typeof setTimeout> | null = null;
  let groupStartedAt: number | null = null;
  let lastSelfBucketKey: string | null = null;
  let lastEnemyBucketKey: string | null = null;
  // Shared by Arena Observer Mode and Battle Focus mode (both funnel through
  // speakArenaLineIfWorthy below). Per-subject, so two different mobs
  // sitting at the same tier at once (a multi-mob pull) don't suppress each
  // other's first mention of it.
  let lastConditionBucketBySubject = new Map<string, string>();
  // Last spoken line's canonical shape, to squelch an immediately-repeating
  // structural duplicate (see canonicalizeArenaLine above).
  let lastSpokenArenaShape: string | null = null;
  // Arena Observer Mode / Bloodbath only — current room name (tracked off
  // the vitals-prompt line) and whether a room-look render block is
  // currently being swallowed (opened by the Exits line, closed by the
  // next prompt).
  let currentRoomName = '';
  let inBloodbathRoomBlock = false;
  // Battle Focus mode only — debuff names currently announced via
  // game:affect-added, so game:affect-removed only speaks a wear-off for
  // ones we actually flagged (never for buffs, which this channel ignores).
  let trackedSelfDebuffs = new Set<string>();

  const stopSpeaking = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    queue = [];
    speaking = false;
    pendingLines = [];
    groupStartedAt = null;
    if (groupTimer !== null) {
      clearTimeout(groupTimer);
      groupTimer = null;
    }
  };

  const pump = (api: PluginRuntimeApi) => {
    if (speaking) return;
    const Synth = window.speechSynthesis;
    if (!Synth) return;

    const next = queue.shift();
    if (next === undefined) return;

    const cfg = api.getConfig();
    const utter = new SpeechSynthesisUtterance(next);

    const voiceName = String(cfg.voiceName ?? '').trim();
    if (voiceName) {
      const voice = Synth.getVoices().find((v) => v.name === voiceName);
      if (voice) utter.voice = voice;
    }
    utter.rate = Number(cfg.rate ?? 1);
    utter.pitch = Number(cfg.pitch ?? 1);
    utter.volume = Number(cfg.volume ?? 1);

    speaking = true;
    utter.onend = () => {
      speaking = false;
      pump(api);
    };
    utter.onerror = () => {
      speaking = false;
      pump(api);
    };

    // Chrome/Edge clip the start of an utterance when speak() is invoked
    // synchronously from the previous utterance's onend, AND after the
    // engine has sat idle for a while (e.g. several skipped prompt lines
    // with nothing actually spoken) — confirmed in practice: a name at the
    // very start of a line (the common case for chat channels — "Joat
    // gossips '...'") got dropped entirely with the old 60ms default, which
    // was tuned for the chained case, not a cold-engine resume. Deferring by
    // a tick plus a resume() nudge right before speaking (harmless/no-op if
    // nothing is paused; a commonly documented workaround for this class of
    // bug) covers both cases without needing to tell them apart.
    const deferMs = Math.max(0, Number(cfg.speakDeferMs ?? 150));
    setTimeout(() => {
      try {
        Synth.resume();
      } catch {
        // ignore
      }
      // The defer/resume above still isn't enough on its own — reported as
      // clipping partway through the first word even on utterances with no
      // prior utterance and no idle period behind them, so this isn't just
      // the cold-start/chained-fire case above. cancel() first clears
      // whatever stale internal state is behind that (safe here: nothing of
      // ours is genuinely mid-utterance yet, since Synth.speak(utter) below
      // is the first real speak() call for this turn of the queue). Then a
      // near-silent "primer" utterance is queued immediately ahead of the
      // real one — browsers play a speak() queue back-to-back with no
      // perceptible gap, so it costs no pause, but it absorbs the engine's
      // own start-of-buffer clip instead of the real utterance eating it.
      try {
        Synth.cancel();
      } catch {
        // ignore
      }
      const primer = new SpeechSynthesisUtterance(PRIMER_UTTERANCE_TEXT);
      primer.volume = 0;
      primer.rate = utter.rate;
      primer.voice = utter.voice;
      Synth.speak(primer);
      Synth.speak(utter);
    }, deferMs);
  };

  const enqueue = (api: PluginRuntimeApi, text: string) => {
    const maxLen = Math.max(1, Number(api.getConfig().maxQueueLength ?? 3));
    queue.push(text);
    while (queue.length > maxLen) queue.shift();
    pump(api);
  };

  const flushGroup = (api: PluginRuntimeApi) => {
    groupTimer = null;
    groupStartedAt = null;
    if (pendingLines.length === 0) return;
    // A plain space, not ". " — most buffered lines here are the MUD's own
    // word-wrap of a single sentence/paragraph, not separate messages, and
    // joining with a period made speech pause mid-sentence at every wrap
    // point. Lines that ARE complete sentences already carry their own
    // terminal punctuation, so a space is still all that's needed between
    // them.
    const combined = pendingLines.join(' ');
    pendingLines = [];
    if (api.getConfig().debug === true) api.log(`Queueing (grouped): "${combined}"`);
    enqueue(api, combined);
  };

  /**
   * Bursts (room descriptions, combat rounds, a single paragraph the MUD
   * word-wraps across several physical lines) arrive as several separate
   * raw-data lines within milliseconds of each other. Speaking each as its
   * own utterance is choppy and gives Chrome/Edge repeated chances to clip
   * the start of the next one, so lines are buffered and flushed together
   * as a single utterance.
   *
   * The window is debounced — each new line pushes the flush back out
   * another groupWindowMs — rather than fixed from the first line, because a
   * wrapped paragraph's lines don't all arrive at once; a fixed window could
   * lapse mid-paragraph and split it across two utterances anyway. Debouncing
   * is bounded by MAX_GROUP_SPAN_MS so a burst that never leaves a gap (heavy
   * combat spam) still flushes periodically instead of blocking speech
   * indefinitely. A window of 0 disables grouping (immediate per-line
   * enqueue, prior behavior).
   */
  const queueLine = (api: PluginRuntimeApi, line: string) => {
    const windowMs = Math.max(0, Number(api.getConfig().groupWindowMs ?? 300));
    if (windowMs === 0) {
      enqueue(api, line);
      return;
    }

    pendingLines.push(line);
    if (groupStartedAt === null) groupStartedAt = Date.now();
    if (groupTimer !== null) clearTimeout(groupTimer);

    const elapsed = Date.now() - groupStartedAt;
    const delay = Math.min(windowMs, Math.max(0, MAX_GROUP_SPAN_MS - elapsed));
    groupTimer = setTimeout(() => flushGroup(api), delay);
  };

  /**
   * Shared tail of Arena Observer Mode AND Battle Focus mode below:
   * known-noise squelch, then a last-spoken-shape dedup so a genuinely
   * repeating effect (a weapon proc, a nag message) goes quiet after its
   * first mention but resumes the moment something else interrupts the
   * streak. Everything else — status effects, stuns, disarms, deaths,
   * flees, and the long tail of genuinely rare/dramatic events — is spoken
   * as-is; this is deliberately not an allowlist-only filter, so the
   * unusual still surfaces even without its own pattern.
   *
   * opts.dropChatLines: Arena Observer Mode only (see "strict chat mode"'s
   * classifyStrictChatSubtype) — say/tell/yell/gossip/ooc/whisper/etc. add
   * nothing to a spectator's picture of the fight and were getting read in
   * full ("Maccus OOC: '...'"), so they're dropped outright rather than
   * classified as noise-or-not on a per-line basis.
   *
   * opts.speakConditionLines: Arena Observer Mode only. Battle Focus mode
   * passes false — condition/health-tier text is dropped there instead of
   * spoken, because "Announce self/enemy health changes" above already
   * covers that via its own GMCP-driven, already-deduped path; speaking
   * both was a double announcement of the same fact. Arena mode has no such
   * overlap (no self/enemy GMCP tracking applies to third-party Coliseum/
   * Bloodbath fighters), so it's the sole source of health info there.
   */
  const speakArenaLineIfWorthy = (
    api: PluginRuntimeApi,
    line: string,
    debug: boolean,
    logPrefix: string,
    opts: { dropChatLines: boolean; speakConditionLines: boolean },
  ) => {
    if (opts.dropChatLines && classifyStrictChatSubtype(line) !== undefined) {
      if (debug) api.log(`${logPrefix}: squelched (chat/speech): "${line}"`);
      return;
    }

    const conditionBucket = matchConditionBucket(line);
    if (conditionBucket) {
      if (!opts.speakConditionLines) {
        if (debug) api.log(`${logPrefix}: squelched (condition line — use the Announce health toggles): "${line}"`);
        return;
      }
      const subject = conditionSubject(line);
      const bucketKey = `${conditionBucket.min}-${conditionBucket.max}`;
      if (lastConditionBucketBySubject.get(subject) === bucketKey) {
        if (debug) api.log(`${logPrefix}: squelched (condition unchanged): "${line}"`);
        return;
      }
      lastConditionBucketBySubject.set(subject, bucketKey);
      queueLine(api, line);
      return;
    }

    if (isArenaSquelchLine(line)) {
      if (debug) api.log(`${logPrefix}: squelched (noise): "${line}"`);
      return;
    }

    const shape = canonicalizeArenaLine(line);
    if (shape === lastSpokenArenaShape) {
      if (debug) api.log(`${logPrefix}: squelched (repeat of last shape): "${line}"`);
      return;
    }
    lastSpokenArenaShape = shape;

    if (debug) api.log(`${logPrefix}: speaking: "${line}"`);
    queueLine(api, line);
  };

  /**
   * Arena Observer Mode's entire pipeline — deliberately independent of the
   * normal shouldOmitLine/excludePromptLines/Battle Focus/include-exclude-
   * pattern chain below, same as Battle Focus mode is its own self-
   * contained filter. Dispatches each line to whichever of the two
   * arena types applies: Coliseum lines carry their own room-bracket prefix
   * (stripped, then classified); Bloodbath is gated on the player's CURRENT
   * room (tracked off the vitals-prompt line, which also terminates a
   * room-look render block — see BLOODBATH_PROMPT_RE/EXITS_LINE_RE above).
   * "Bloodbath System: ..." announcements (join window, elimination count,
   * winner) always speak regardless of room state — they're the event's own
   * narrator, not something to filter. There's no "you" in Coliseum mode
   * (the listener is a spectator); Bloodbath IS the listener's own combat,
   * so self-referential lines pass through the same classifier as everyone
   * else's.
   */
  const handleArenaLine = (api: PluginRuntimeApi, plain: string, debug: boolean) => {
    for (const rawLine of plain.split('\n')) {
      const full = rawLine.trim();
      if (!full) continue;

      const promptMatch = full.match(BLOODBATH_PROMPT_RE);
      if (promptMatch) {
        currentRoomName = (promptMatch[1] ?? '').trim();
        inBloodbathRoomBlock = false;
        continue;
      }

      if (full.startsWith('Bloodbath System:')) {
        if (debug) api.log(`Arena: speaking (Bloodbath System): "${full}"`);
        queueLine(api, full);
        continue;
      }

      const coliseumLine = stripArenaPrefix(full);
      if (coliseumLine !== null) {
        if (coliseumLine) {
          speakArenaLineIfWorthy(api, coliseumLine, debug, 'Arena (Coliseum)', {
            dropChatLines: true,
            speakConditionLines: true,
          });
        }
        continue;
      }

      if (currentRoomName !== BLOODBATH_ROOM_NAME) {
        if (debug) api.log(`Arena: skipped (outside any tracked arena): "${full}"`);
        continue;
      }

      // Bloodbath room-look renders (title/description/exits/scenery/
      // "X is here[, fighting Y]" listings) are pure noise, not combat —
      // squelch the fixed title/description literals directly, then use
      // the Exits line to open a block that swallows everything until the
      // next prompt (the only reliable terminator, since blank lines never
      // reach this loop at all — they're filtered out above).
      if (full === BLOODBATH_ROOM_NAME || full === BLOODBATH_ROOM_DESC) continue;
      if (EXITS_LINE_RE.test(full)) {
        inBloodbathRoomBlock = true;
        continue;
      }
      if (inBloodbathRoomBlock) continue;

      // The bleed-status nag repeats every round while active (847
      // occurrences in the mining pass) — a real debuff worth one mention,
      // not 847. Reuses lastConditionBucketBySubject under a synthetic
      // subject key so it can't collide with a real self-condition-tier
      // entry for "You".
      if (full === 'You sure are BLEEDING!') {
        if (lastConditionBucketBySubject.get('You (bleeding)') !== 'active') {
          lastConditionBucketBySubject.set('You (bleeding)', 'active');
          queueLine(api, full);
        }
        continue;
      }

      speakArenaLineIfWorthy(api, full, debug, 'Arena (Bloodbath)', { dropChatLines: true, speakConditionLines: true });
    }
  };

  /** Bypasses the play-area queue — a one-off user-triggered read, not a stream. */
  const speakNow = (api: PluginRuntimeApi, text: string) => {
    stopSpeaking();
    enqueue(api, text);
  };

  return {
    manifest: {
      id: 'text-to-speech',
      name: 'Text to Speech',
      version: '0.1.0',
      description:
        "Reads text aloud using the browser's built-in speech synthesis. Two independent targets: auto-read incoming game lines (filtered + capped, respects existing line-squelch rules, auto-skips PROMPT/status lines regardless of format), and an on-demand floating button that reads selected/focused text anywhere else on the page.",
    },

    configSchema: {
      defaults: {
        enablePlayArea: true,
        enablePageItems: false,
        voiceName: '',
        rate: 1,
        pitch: 1,
        volume: 1,
        includePatterns: '',
        excludePatterns: '',
        excludePromptLines: true,
        maxQueueLength: 3,
        groupWindowMs: 300,
        speakDeferMs: 150,
        alertSelfHealth: false,
        alertEnemyHealth: false,
        alertGameTick: false,
        alertTickIncludeTime: true,
        combatMode: 'off',
        alertStunned: false,
        arenaObserverMode: false,
        debug: false,
      },
      fields: [
        {
          key: 'enablePlayArea',
          type: 'boolean',
          label: 'Read the play area aloud',
          description: 'Auto-reads incoming game lines as they arrive. Exclusively the play/command terminal.',
        },
        {
          key: 'enablePageItems',
          type: 'boolean',
          label: 'Read page items aloud',
          description: 'Adds a floating button that reads selected text (or the focused field) aloud on click. Exclusively everything except the play/command input.',
        },
        {
          key: 'alertSelfHealth',
          type: 'boolean',
          label: 'Announce your health changes',
          description: 'Speaks an alert (e.g. "Alert: You are around 62 percent health.") whenever your hp crosses into a new condition tier — same 7 tier boundaries "Announce enemy health changes" below uses, just read as the numeric est estimate instead of the enemy\'s phrase, since exact self hp/hpMax numbers are available where an enemy\'s aren\'t. Not on every point of damage. Independent of the play area toggle above.',
        },
        {
          key: 'alertEnemyHealth',
          type: 'boolean',
          label: 'Announce enemy health changes',
          description: 'Speaks an alert (e.g. "Alert: The goblin has some small wounds and bruises.") whenever the current opponent\'s health — the same condition tier already shown on the enemy HUD bar — changes tier.',
        },
        {
          key: 'alertGameTick',
          type: 'boolean',
          label: 'Announce game ticks',
          description: 'Speaks a short alert (e.g. "Tick.") every time the server\'s tick event fires — the same heartbeat event that drives the tick timer HUD. Independent of the play area toggle above.',
        },
        {
          key: 'alertTickIncludeTime',
          type: 'boolean',
          label: 'Include the time in tick alerts',
          description: 'Adds the in-game time to the tick alert (e.g. "Tick. It is 12:30am.") — the time comes from that same tick event, not a separate lookup. Only matters when "Announce game ticks" above is on.',
        },
        {
          key: 'combatMode',
          type: 'select',
          label: 'Combat mode',
          description: 'Off: reads combat lines the same as everything else (filtered by include/exclude patterns and squelch rules below, nothing more). Battle Focus: a "game caster" mode for your own fights — instead of every blow, it calls out status effects (buffs AND debuffs), stuns/incapacitation, disarms, deaths, and flees, and drops plain damage, avoidance, mundane movement, item-use lines, named-attack cast flavor ("rears back and throws a roundhouse punch!"), and weapon-flag procs as noise (reuses Combat Compression\'s log-verified patterns). Condition/health-tier lines are dropped here, not spoken — use "Announce self/enemy health changes" below for that, which is deduped separately; speaking both was a double announcement of the same tier change. Also folds in self debuffs the game\'s own affects tracking reports (see the char-affects GMCP note on "Announce when you\'re stunned" below) — it won\'t catch stuns/charms/etc. (those have no numeric modifier to key off, hence the separate text-pattern-based Incapacitation coverage), but it does catch stat debuffs a text pattern would otherwise miss entirely. A repeat of the same structural line (e.g. the same weapon proc landing again right after) is squelched once, then re-announced once something else interrupts the streak. Unmatched lines are still spoken by default — genuinely rare/unusual events are the point, this isn\'t an allowlist. Your own include/exclude patterns below still apply on top of Battle Focus\'s own filtering either way — they\'re a harder veto, not replaced by it (unlike Arena Observer Mode, which does bypass them entirely).',
          options: [
            { label: 'Off (read everything, as before)', value: 'off' },
            { label: 'Battle Focus (highlights only)', value: 'battleFocus' },
          ],
        },
        {
          key: 'alertStunned',
          type: 'boolean',
          label: "Announce when you're stunned",
          description: 'Speaks "Alert: You are stunned!" on a confirmed self-stun (bash knockdown, trip) — the same lines the Stun Highlight plugin recolors in the terminal. Independent of Combat Mode above. Also, whenever Combat Mode is Battle Focus: the game\'s own char-affects GMCP tracking (game:affect-added/removed — the same feed the Affects panel uses) speaks a debuff the moment it lands ("You are afflicted by weaken.") and its wear-off, using the modifier\'s sign to tell debuff from buff (inverted for AC, where DSL/MERC convention makes a higher number worse) — buffs and zero-modifier effects (stuns, charms — this feed doesn\'t carry a sign for those) are left to the text-pattern coverage instead.',
        },
        {
          key: 'arenaObserverMode',
          type: 'boolean',
          label: 'Arena observer mode (Coliseum + Bloodbath)',
          description: 'A "game caster" mode, not a play-by-play one: while on, only narrates the highlights/lowlights of an arena fight, covering both arena types. Coliseum: spectator-only — ONLY lines broadcast from the five Coliseum rooms are spoken, everything else (including your own surroundings) is silent, and there\'s no "you" since the listener is a spectator. Bloodbath: you ARE a fighter — gated on your current room instead, room-look renders (title/description/exits/who\'s-here listings) and ordinary command noise are dropped, and "Bloodbath System:" announcements (join window, elimination countdown, winner) always speak regardless of room. Both: plain damage, avoidance, mundane movement/item-use, named-attack cast flavor ("rears back and throws a roundhouse punch!"), weapon-flag procs, and chat/speech lines (say/tell/yell/gossip/OOC/etc., via the same classifier "strict chat mode" uses) are dropped as noise — not every blow (or every OOC comment) gets called; status effects (buffs AND debuffs), stuns/incapacitation, disarms, deaths, and flees are spoken about whichever fighter they happened to; health/condition-tier lines (and the Bloodbath bleed nag) are spoken once and only again on a real change. Unmatched lines are still spoken by default — genuinely rare/dramatic events are the point. This replaces the normal play-area filtering entirely (include/exclude patterns, prompt-skip, and Combat Mode are ignored while this is on) — it isn\'t additive with those settings.',
        },
        {
          key: 'voiceName',
          type: 'select',
          label: 'Voice',
          description: 'Voices installed and reported by this browser, each labeled with its language. If the list looks short or missing voices you know are installed, close and reopen this dialog — the browser reports voices asynchronously shortly after the page loads.',
          options: voiceSelectOptions(),
        },
        {
          key: 'rate',
          type: 'number',
          label: 'Rate',
          description: 'Speaking speed, 0.5 (slow) to 2 (fast).',
          min: 0.5,
          max: 2,
          step: 0.1,
        },
        {
          key: 'pitch',
          type: 'number',
          label: 'Pitch',
          description: '0 (low) to 2 (high).',
          min: 0,
          max: 2,
          step: 0.1,
        },
        {
          key: 'volume',
          type: 'number',
          label: 'Volume',
          description: '0 (silent) to 1 (full).',
          min: 0,
          max: 1,
          step: 0.1,
        },
        {
          key: 'includePatterns',
          type: 'textarea',
          label: 'Include patterns (play area)',
          description: 'One pattern per line — a plain word/phrase or a regex (case-insensitive; e.g. "^\\w+ (tells|gossips) you"). A line that fails to compile as a regex is matched as a literal substring instead. If non-empty, only lines matching at least one pattern are read.',
          placeholder: 'tells you\nsays',
          optional: true,
        },
        {
          key: 'excludePatterns',
          type: 'textarea',
          label: 'Exclude patterns (play area)',
          description: 'One pattern per line — a plain word/phrase or a regex (case-insensitive). A line that fails to compile as a regex is matched as a literal substring instead. Lines matching any pattern are never read — exclusions always win over includes.',
          placeholder: 'misses\nHP:',
          optional: true,
        },
        {
          key: 'excludePromptLines',
          type: 'boolean',
          label: 'Skip prompt/status lines',
          description: 'Every player builds their own PROMPT (HELP PROMPT) from %h/%m/%v/etc. tokens, so it looks different per person — this detects the vitals cluster (hp plus mana and/or moves) that any such prompt has, rather than matching one literal format, and skips it regardless of what yours looks like.',
        },
        {
          key: 'maxQueueLength',
          type: 'number',
          label: 'Max queued lines',
          description: 'When incoming lines arrive faster than they can be spoken, the oldest queued (not currently speaking) line is dropped once this cap is exceeded, so speech stays roughly current.',
          min: 1,
          max: 20,
          step: 1,
        },
        {
          key: 'groupWindowMs',
          type: 'number',
          label: 'Line grouping window (ms)',
          description: 'Each new play-area line pushes this window out further, so a burst — room descriptions, combat rounds, or a paragraph the MUD word-wraps across several lines — is combined into one flowing spoken utterance instead of choppy, pause-y separate ones, however long the burst takes to fully arrive (capped internally so speech can\'t lag too far behind). 0 disables grouping.',
          min: 0,
          max: 2000,
          step: 50,
        },
        {
          key: 'speakDeferMs',
          type: 'number',
          label: 'Utterance start delay (ms)',
          description: 'Chrome/Edge clip the very start of an utterance — right after the previous one ends, or after the engine has sat idle for a while — dropping the first word (often a speaker\'s name on a chat line, e.g. "Joat gossips \'...\'" losing "Joat"). This delay, plus a harmless resume() nudge right before speaking, covers both cases. Raise it if clipping persists, or lower it for snappier back-to-back speech.',
          min: 0,
          max: 1000,
          step: 10,
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs which lines get queued/skipped.',
        },
      ],
      actions: [
        {
          key: 'sync-targets',
          label: 'Apply target settings',
          description: 'Click after toggling the targets above — they are not applied live otherwise.',
        },
        {
          key: 'list-voices',
          label: 'List voices',
          description: 'The Voice dropdown above already lists installed voices, but if it looked empty/short when this dialog opened, click this to force the browser to report them into the console — then close and reopen this dialog to refresh the dropdown.',
        },
        {
          key: 'stop-speaking',
          label: 'Stop speaking',
          description: 'Cancels current speech and clears the queue.',
        },
      ],
    },

    assets: {
      css: FLOATING_BUTTON_CSS,
    },

    onEnable(api: PluginRuntimeApi) {
      const getReadTarget = (): string | null => {
        const sel = window.getSelection()?.toString().trim();
        if (sel) return sel;

        const el = document.activeElement;
        if (!el || el === document.body || el.id === COMMAND_INPUT_ID) return null;

        if ('value' in el && typeof (el as HTMLInputElement).value === 'string') {
          return (el as HTMLInputElement).value.trim() || null;
        }
        return (el.textContent ?? '').trim() || null;
      };

      const onReadClick = () => {
        const text = getReadTarget();
        if (!text) {
          api.error('Nothing to read — select text or focus a text field first (not the command input).');
          return;
        }
        speakNow(api, text);
      };

      const onStopClick = () => stopSpeaking();

      const syncTargets = () => {
        const cfg = api.getConfig();

        if (cfg.enablePageItems === true) {
          if (!readButton) {
            readButton = document.createElement('button');
            readButton.type = 'button';
            readButton.id = READ_BUTTON_ID;
            readButton.textContent = '🔊';
            readButton.title = 'Read selected/focused text aloud';
            document.body.appendChild(readButton);
          }
          readButton.removeEventListener('click', onReadClick);
          readButton.addEventListener('click', onReadClick);
        } else if (readButton) {
          readButton.remove();
          readButton = null;
        }

        if (cfg.enablePlayArea === true || cfg.enablePageItems === true) {
          if (!stopButton) {
            stopButton = document.createElement('button');
            stopButton.type = 'button';
            stopButton.id = STOP_BUTTON_ID;
            stopButton.textContent = '🔇';
            stopButton.title = 'Stop speaking';
            document.body.appendChild(stopButton);
          }
          stopButton.removeEventListener('click', onStopClick);
          stopButton.addEventListener('click', onStopClick);
        } else if (stopButton) {
          stopButton.remove();
          stopButton = null;
        }
      };

      syncTargets();
      api.registerAction('sync-targets', syncTargets);

      api.registerAction('stop-speaking', stopSpeaking);

      // Health alerts are independent of the play-area/page-items targets —
      // subscribed directly (not via the module's onEvent hook below, which
      // only sees shatteredarchive:raw-data) so they work even with the
      // play area toggle off.
      const offSelfHealth = api.onEvent('game:char-data', (payload) => {
        const cfg = api.getConfig();
        const d = (payload ?? {}) as Record<string, unknown>;

        if (cfg.alertSelfHealth === true) {
          const hp = Number(d.hp ?? NaN);
          const hpMax = Number(d.hpMax ?? d.max_hp ?? NaN);
          if (cfg.debug === true) {
            api.log(
              `SelfHealth: raw hp=${JSON.stringify(d.hp)} hpMax=${JSON.stringify(d.hpMax)} max_hp=${JSON.stringify(d.max_hp)} -> parsed hp=${hp} hpMax=${hpMax}`,
            );
          }
          if (Number.isFinite(hp) && Number.isFinite(hpMax) && hpMax > 0) {
            const pct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
            const bucket = bucketForPct(SELF_CONDITION_BUCKETS, pct);
            if (cfg.debug === true) {
              api.log(`SelfHealth: pct=${pct.toFixed(2)} bucket=${bucket ? `${bucket.min}-${bucket.max}` : 'none'} lastKey=${lastSelfBucketKey}`);
            }
            if (bucket) {
              const key = `${bucket.min}-${bucket.max}`;
              // First reading just establishes a baseline (e.g. on login) —
              // only announce actual tier transitions after that.
              if (lastSelfBucketKey === null) {
                lastSelfBucketKey = key;
              } else if (key !== lastSelfBucketKey) {
                lastSelfBucketKey = key;
                // Speaks the numeric est estimate (same 7 tier boundaries/
                // est values as OPPONENT_BUCKETS — deliberately kept in sync
                // there) rather than the phrase, per explicit request:
                // self-health should "match" the enemy percent-status
                // mapping's numbers, not read out a sentence.
                enqueue(api, `Alert: You are around ${bucket.est} percent health.`);
              }
            }
          }
        }

      });

      const offEnemyHealth = api.onEvent('event:fighting:opponent', (payload) => {
        if (api.getConfig().alertEnemyHealth !== true) return;

        const d = (payload ?? {}) as { label?: string; pct?: number };
        const pct = Number(d.pct);
        if (!Number.isFinite(pct)) return;

        const bucket = bucketForPct(OPPONENT_BUCKETS, pct);
        if (!bucket) return;

        const label = (d.label ?? '').trim() || 'The enemy';
        const key = `${label}::${bucket.min}-${bucket.max}`;
        if (key === lastEnemyBucketKey) return;
        lastEnemyBucketKey = key;
        // bucket.phrase already reads like "has some small wounds and
        // bruises." — same wording the combat log/HUD use for this enemy.
        enqueue(api, `Alert: ${label} ${bucket.phrase}`);
      });

      // Battle Focus mode's self-debuff channel — see isAffectDebuff's
      // comment for why this only covers stat-modifying debuffs, not
      // stuns/charms/etc. Independent of the text-pattern Incapacitation/
      // Status coverage in speakArenaLineIfWorthy; this catches debuff
      // spells that never got their own text pattern written for them.
      const offAffectAdded = api.onEvent('game:affect-added', (payload) => {
        if (api.getConfig().combatMode !== 'battleFocus') return;

        const p = payload as any;
        const affect = p?.affect ?? p;
        const name = String(affect?.n ?? '').trim();
        if (!name) return;
        const modifier = Number(affect?.m ?? 0);
        const location = String(affect?.lc ?? '');
        if (!isAffectDebuff(modifier, location)) return;

        trackedSelfDebuffs.add(name);
        enqueue(api, `You are afflicted by ${name}.`);
      });

      const offAffectRemoved = api.onEvent('game:affect-removed', (payload) => {
        if (api.getConfig().combatMode !== 'battleFocus') return;

        const p = payload as any;
        const name = String(p?.n ?? '').trim();
        if (!name || !trackedSelfDebuffs.has(name)) return;

        trackedSelfDebuffs.delete(name);
        enqueue(api, `${name} has worn off.`);
      });

      // Same event that drives the tick timer HUD (tickStore.ts) — the
      // in-game time is already part of this payload (payload.time), not a
      // separate lookup, so "include the time" is just a formatting choice.
      const offTick = api.onEvent('game:tick', (payload) => {
        if (api.getConfig().alertGameTick !== true) return;

        const d = (payload ?? {}) as { time?: string };
        const includeTime = api.getConfig().alertTickIncludeTime === true;
        const time = typeof d.time === 'string' ? d.time.trim() : '';

        enqueue(api, includeTime && time ? `Tick. It is ${time}.` : 'Tick.');
      });

      api.registerAction('list-voices', () => {
        const Synth = window.speechSynthesis;
        if (!Synth) {
          api.error('speechSynthesis is not supported in this browser.');
          return;
        }

        const logVoices = () => {
          const voices = refreshVoiceCache();
          if (voices.length === 0) {
            api.log('No voices reported by this browser.');
            return;
          }
          for (const v of voices) api.log(`${v.name} (${v.lang})`);
        };

        if (Synth.getVoices().length === 0) {
          api.log('Voices not loaded yet — waiting for the browser to report them…');
          const handler = () => {
            Synth.removeEventListener('voiceschanged', handler);
            logVoices();
          };
          Synth.addEventListener('voiceschanged', handler);
          return;
        }

        logVoices();
      });

      return () => {
        stopSpeaking();
        offSelfHealth();
        offEnemyHealth();
        offAffectAdded();
        offAffectRemoved();
        offTick();
        lastSelfBucketKey = null;
        lastEnemyBucketKey = null;
        lastConditionBucketBySubject.clear();
        lastSpokenArenaShape = null;
        currentRoomName = '';
        inBloodbathRoomBlock = false;
        trackedSelfDebuffs.clear();
        if (readButton) {
          readButton.removeEventListener('click', onReadClick);
          readButton.remove();
          readButton = null;
        }
        if (stopButton) {
          stopButton.removeEventListener('click', onStopClick);
          stopButton.remove();
          stopButton = null;
        }
      };
    },

    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      if (evt.name !== 'shatteredarchive:raw-data') return;

      const cfg = api.getConfig();
      if (cfg.enablePlayArea !== true) return;

      const payload = evt.payload as { rawText?: string; text?: string; fromUserScript?: boolean } | undefined;
      const rawText = String(payload?.rawText ?? payload?.text ?? '');
      if (!rawText) return;

      const fromUserScript = payload?.fromUserScript === true;
      const includePatterns = parsePatterns(cfg.includePatterns);
      const excludePatterns = parsePatterns(cfg.excludePatterns);
      const debug = cfg.debug === true;

      const plain = stripAnsi(rawText).replace(/\r/g, '');

      if (cfg.arenaObserverMode === true) {
        handleArenaLine(api, plain, debug);
        return;
      }

      for (const rawLine of plain.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        // Checked BEFORE the squelch check below on purpose: Stun Highlight
        // squelches this exact original line (via the same shared omit-rule
        // store shouldOmitLine reads) so it can re-emit a recolored version —
        // if this check ran after shouldOmitLine, enabling Stun Highlight
        // would silently break this alert by eating the line first.
        if (cfg.alertStunned === true && isSelfStunLine(line)) {
          if (debug) api.log(`Stun detected: "${line}"`);
          enqueue(api, 'Alert: You are stunned!');
          continue;
        }

        // Mirrors shatteredArchiveTerminal.ts's own display check, so
        // "read the play area aloud" reads exactly what's visually shown.
        if (!fromUserScript && shouldOmitLine('shatteredarchive:raw-data', line)) {
          if (debug) api.log(`Skipped (squelched): "${line}"`);
          continue;
        }

        if (cfg.excludePromptLines === true && looksLikePromptLine(line)) {
          if (debug) api.log(`Skipped (prompt line): "${line}"`);
          continue;
        }

        // Checked BEFORE Battle Focus mode on purpose (unlike Arena Observer
        // Mode, which deliberately bypasses these — see handleArenaLine's
        // doc comment): Battle Focus's own classifier decides what's noise
        // vs. a highlight, but the user's own exclude/include patterns are a
        // harder veto layered on top of that, not replaced by it. The old
        // compressCombatSpam block got this right by construction — it only
        // `continue`d for lines it explicitly recognized, so anything else
        // fell through to this same check; Battle Focus's unconditional
        // `continue` after speakArenaLineIfWorthy below would otherwise skip
        // it for every line, not just the recognized ones.
        if (excludePatterns.length > 0 && matchesAny(line, excludePatterns)) {
          if (debug) api.log(`Skipped (excluded): "${line}"`);
          continue;
        }
        if (includePatterns.length > 0 && !matchesAny(line, includePatterns)) {
          continue;
        }

        // Battle Focus mode: same classify-and-speak pipeline as Arena
        // Observer Mode (squelch Damage/Avoidance/Ambient/Item Use/Attack
        // Flavor/UI Noise/weapon-flag procs, speak Status/Incapacitation/
        // Disarm/Death/Flee immediately, dedupe repeats), just applied to
        // the player's own normal play-area stream instead of a room-gated
        // one. Condition-tier lines are dropped here (speakConditionLines:
        // false) rather than spoken, since "Announce self/enemy health
        // changes" below already covers that through its own deduped GMCP
        // path — speaking both was a double announcement of the same fact.
        // Chat/speech lines are left alone (dropChatLines: false) — unlike
        // Arena Observer Mode's spectator framing, this is the player's own
        // conversation, not incidental noise.
        if (cfg.combatMode === 'battleFocus') {
          speakArenaLineIfWorthy(api, line, debug, 'BattleFocus', { dropChatLines: false, speakConditionLines: false });
          continue;
        }

        if (debug) api.log(`Buffering: "${line}"`);
        queueLine(api, line);
      }
    },
  };
}
