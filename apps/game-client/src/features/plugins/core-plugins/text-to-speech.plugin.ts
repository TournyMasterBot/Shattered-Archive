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
import { stripAnsiForSpeech } from './speech-text';
import { shouldOmitLine } from '../../userScripts/triggerOmitStore';
import { OPPONENT_BUCKETS } from '../../combat/opponent-buckets';
import { SELF_CONDITION_BUCKETS } from '../../combat/self-condition-buckets';
import { PATTERNS as COMBAT_PATTERNS } from './combat-compression.plugin';
import { PATTERNS as WEAPON_FLAG_PATTERNS } from './weapon-flag-squelch.plugin';
import { classifyStrictChatSubtype } from '../../chat/strict-chat-classifier';
import { persistPluginConfigPatch } from '../pluginConfigPersist';

const PLUGIN_ID = 'text-to-speech';

const COMMAND_INPUT_ID = 'game-command-input';
const CONTROLS_ID = 'text-to-speech-controls';
const READ_BUTTON_ID = 'text-to-speech-read-btn';
const STOP_BUTTON_ID = 'text-to-speech-stop-btn';
const PAUSE_BUTTON_ID = 'text-to-speech-pause-btn';
const MODES_BUTTON_ID = 'text-to-speech-modes-btn';
const MODES_PANEL_ID = 'text-to-speech-modes-panel';

/**
 * The controls are ONE draggable group, not independently-placed buttons.
 *
 * They were separate fixed-position elements each with their own drag handler and
 * their own remembered position, which meant placing them was a per-button chore
 * and adding a third and fourth made that worse. The group is the positioned
 * element now; the buttons are ordinary flow content inside it.
 *
 * column-reverse so the FIRST child sits at the bottom: mute stays pinned to the
 * original bottom-left anchor (it is the one control you reach for in a hurry),
 * and each additional bubble stacks upward from it rather than shifting it.
 */
const FLOATING_BUTTON_CSS = `
#${CONTROLS_ID} {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 500;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  align-items: center;
}
/* Dragging sets left/top inline; the bottom anchor above has to stop applying or
   the group would be pinned by both edges at once. */
#${CONTROLS_ID}[data-moved="1"] { bottom: auto; }
#${CONTROLS_ID}:active { cursor: grabbing; }
#${CONTROLS_ID} button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #555;
  background: #1a1a1a;
  color: #f0f0f0;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
#${CONTROLS_ID} button:hover { background: #242424; }
/* Paused is a HELD state, not a momentary one — the group can sit paused
   indefinitely, so it needs to be obvious at a glance why nothing is speaking. */
#${PAUSE_BUTTON_ID}[data-paused="1"] {
  background: #4a3000;
  border-color: #c98a00;
}
#${PAUSE_BUTTON_ID}[data-paused="1"]:hover { background: #5c3c00; }
/* The category switches live behind ONE bubble. As five permanent bubbles they cost
   more screen than the controls they sit next to, and they are a settings surface —
   glanced at when changing something, not while playing. */
#${MODES_BUTTON_ID}[data-open="1"] {
  border-color: #7ea6c9;
  background: #16242e;
}

/* Absolutely positioned so opening the panel never resizes the group (which is the
   drag target — a group that changes size under the cursor is horrible to place),
   and anchored to the button's edge rather than the viewport so it follows the
   group wherever it has been dragged. */
#${MODES_PANEL_ID} {
  position: absolute;
  left: calc(100% + 10px);
  bottom: 0;
  z-index: 1;
  display: none;
  flex-direction: column;
  gap: 2px;
  min-width: 215px;
  padding: 8px;
  border: 1px solid #555;
  border-radius: 10px;
  background: #141414;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
}
#${MODES_PANEL_ID}[data-open="1"] { display: flex; }
/* Flipped by script when the group sits too near the right edge to open rightward. */
#${MODES_PANEL_ID}[data-side="left"] { left: auto; right: calc(100% + 10px); }
#${MODES_PANEL_ID} .tts-panel-title {
  padding: 2px 6px 6px;
  color: #9aa0a6;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
#${MODES_PANEL_ID} .tts-panel-note {
  padding: 6px 6px 2px;
  color: #9aa0a6;
  font-size: 0.72rem;
  line-height: 1.35;
}
/* Overrides the round 40px bubble styling above — same specificity, so this block
   has to stay after it. */
#${MODES_PANEL_ID} button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: auto;
  padding: 7px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
  font-size: 0.82rem;
  text-align: left;
}
#${MODES_PANEL_ID} button:hover { background: #232323; }
#${MODES_PANEL_ID} button .tts-panel-state {
  margin-left: auto;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}
/* Off is the state that has to be obvious — an unlit switch explains silence, and
   silence is otherwise indistinguishable from the plugin being broken. */
#${MODES_PANEL_ID} button[data-on="0"] { color: #6b7075; }
#${MODES_PANEL_ID} button[data-on="0"] .tts-panel-state { color: #6b7075; }
#${MODES_PANEL_ID} button[data-on="1"] {
  color: #f0f0f0;
  border-color: #2f4d63;
  background: #16242e;
}
#${MODES_PANEL_ID} button[data-on="1"]:hover { background: #1d3040; }
#${MODES_PANEL_ID} button[data-on="1"] .tts-panel-state { color: #7ea6c9; }
#${MODES_PANEL_ID} button[data-arena="1"][data-on="1"] {
  border-color: #6b5714;
  background: #33290a;
}
#${MODES_PANEL_ID} button[data-arena="1"][data-on="1"]:hover { background: #443616; }
#${MODES_PANEL_ID} button[data-arena="1"][data-on="1"] .tts-panel-state { color: #c9a227; }
`;

/**
 * Speech-rate model used to size utterances, the stall watchdog, and the keepalive.
 *
 * Chrome/Edge do not cap utterance LENGTH — nothing in the Web Speech API spec
 * does. What they have is a stall at roughly 15 seconds of continuous speech,
 * with no `end` event, which additionally wedges any queue pump waiting on
 * `onend`. So the real budget is TIME, and the number of characters that fits in
 * it scales with `rate`: at rate 2 twice as much text fits in the same window, at
 * rate 0.3 barely a third does.
 *
 * The previous flat 200-char cap modelled rate 1 and was silently wrong at every
 * other rate — needlessly breaking mid-sentence when fast, and running past the
 * engine's window when slow (the exact stall it existed to prevent).
 *
 * ~18 chars/sec is a default voice at rate 1 (~165 wpm at ~6.5 chars/word). It
 * does not need to be exact, only close enough that the windows below stay safe.
 */
const SPEECH_CHARS_PER_SECOND = 18;

/**
 * Speech-seconds allowed in one utterance with NO keepalive running. Held well
 * short of the ~15s stall: the estimate above is approximate, and a voice slower
 * than the model would otherwise walk straight into the failure.
 */
const UNASSISTED_UTTERANCE_SECONDS = 11;

/**
 * Speech-seconds allowed while the keepalive is running. Long, but deliberately
 * not unbounded — cancel() is the only way to interrupt an utterance, so a very
 * long one makes the stop button coarse, and a lost `end` event costs
 * proportionally more time before the watchdog recovers.
 */
const ASSISTED_UTTERANCE_SECONDS = 55;

/**
 * Keepalive tick, a pause()+resume() pair that restarts the engine's internal
 * stall timer without moving the playback position.
 *
 * WALL-CLOCK, and deliberately not scaled by rate: the engine's ~15s cutoff is
 * itself wall-clock, so speaking faster does not buy a longer interval. Rate
 * enters the picture only in whether the keepalive is armed at all (see pump()).
 */
const KEEPALIVE_INTERVAL_MS = 10_000;

/** Estimated seconds of speech for `text` at `rate`. */
export function speechSecondsFor(text: string, rate: number): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return text.length / (SPEECH_CHARS_PER_SECOND * safeRate);
}

/**
 * Longest single utterance to hand the browser at this rate.
 *
 * Floored so a very slow rate still yields a usable chunk — the cap shrinking
 * proportionally all the way down would split every sentence into fragments,
 * trading the stall for speech that is unlistenable in a different way.
 */
export function maxUtteranceCharsFor(rate: number, keepaliveEnabled: boolean): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const seconds = keepaliveEnabled ? ASSISTED_UTTERANCE_SECONDS : UNASSISTED_UTTERANCE_SECONDS;
  return Math.max(80, Math.round(SPEECH_CHARS_PER_SECOND * safeRate * seconds));
}

/**
 * Coerces a config value to a usable number, falling back to `fallback` when it is
 * missing, non-numeric, or an empty string, then clamping into [min, max].
 *
 * Exists because the failure it prevents is invisible: a rate or volume of 0 makes
 * an utterance silent while still firing start and end normally, so it presents as
 * "text to speech is broken" rather than "a setting is wrong".
 */
function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : raw === '' || raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Splits `text` into a speakable head of at most `max` characters plus the rest.
 *
 * Prefers a sentence end, then any whitespace, and only cuts mid-word when a
 * single token genuinely exceeds the limit — a break in the wrong place is
 * audible, so the ugly cut is the last resort rather than the default.
 */
export function splitForSpeech(text: string, max: number): [string, string] {
  if (text.length <= max) return [text, ''];
  const window = text.slice(0, max + 1);
  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  const cut = sentence > max * 0.4 ? sentence + 1 : window.lastIndexOf(' ');
  if (cut <= 0) return [text.slice(0, max), text.slice(max).trim()];
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

/** Where a dragged button's position is remembered, per button id. */
const BUTTON_POS_KEY = (id: string) => `text-to-speech:btn-pos:${id}`;

/**
 * Makes a floating button drag-positionable, remembering where it was left.
 *
 * Deliberately pointer events rather than mouse events, so a touch drag works the
 * same as a mouse one — these buttons overlay the play area, and on a tablet the
 * whole point is being able to shove one out of the way of the text you are reading.
 *
 * Click and drag have to stay distinguishable: the button's real job is a single
 * tap, so a press that moves less than DRAG_SLOP is left alone entirely and still
 * fires a normal click, while anything past that threshold suppresses the click
 * that would otherwise land at the end of the drag.
 */
function makeDraggable(el: HTMLElement, legacyId?: string): void {
  const DRAG_SLOP = 4;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let dragging = false;
  let moved = false;

  // Restore a remembered position. Clamped on apply rather than on save, because the
  // window may well be a different size than it was when the position was stored.
  // `legacyId` carries a position forward from an element this one replaces — the
  // controls group inherits wherever the standalone mute button was last dropped,
  // rather than silently jumping back to the default corner.
  try {
    const saved =
      window.localStorage.getItem(BUTTON_POS_KEY(el.id)) ??
      (legacyId ? window.localStorage.getItem(BUTTON_POS_KEY(legacyId)) : null);
    if (saved) {
      const { left, top } = JSON.parse(saved) as { left: number; top: number };
      if (Number.isFinite(left) && Number.isFinite(top)) applyPosition(el, left, top);
    }
  } catch {
    // A corrupt or unavailable store just means "no remembered position".
  }

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
  });

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
    if (!moved) {
      // Capture so the drag survives the pointer leaving the element, which it will
      // immediately — these are 40px targets and the cursor is dragging them around.
      //
      // Deliberately here and not in pointerdown: `el` is now the GROUP, and a
      // capture held from pointerdown retargets the terminating `click` away from
      // the individual button that was pressed, so every bubble press would be
      // swallowed. Capturing only once a real drag starts means a plain click never
      // involves capture at all.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is an optimization for a drag already in progress, not a
        // precondition for it — losing it just means the drag ends early.
      }
    }
    moved = true;
    applyPosition(el, originLeft + dx, originTop + dy);
  });

  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!moved) return;
    const rect = el.getBoundingClientRect();
    try {
      window.localStorage.setItem(BUTTON_POS_KEY(el.id), JSON.stringify({ left: rect.left, top: rect.top }));
    } catch {
      // Position memory is a convenience; a full/blocked store must not break the button.
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // Swallow the click that terminates a drag, so releasing over the button does not
  // also trigger its action. Capture phase, because the button's own click handler
  // is registered normally and would otherwise run first.
  el.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (!moved) return;
      moved = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

/** Clamps to the viewport so a button can never be dragged somewhere unreachable. */
function applyPosition(el: HTMLElement, left: number, top: number): void {
  const w = el.offsetWidth || 40;
  const h = el.offsetHeight || 40;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  el.dataset.moved = '1';
  el.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
  el.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
}

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

/**
 * The room name the vitals prompt carries — the same capture BLOODBATH_PROMPT_RE
 * uses, aliased because room-look tracking needs it for EVERY room, not just the
 * arena. Prompts are a second source of room names alongside the GMCP room feed,
 * and worth having: on a room the GMCP feed has not re-reported, the prompt is what
 * tells us the next bare title line is a room title and not ordinary text.
 */
const PROMPT_ROOM_NAME_RE = BLOODBATH_PROMPT_RE;

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

/**
 * What a line IS. Every play-area line lands in exactly one of these, and each has
 * its own independent on/off toggle — the categories compose rather than excluding
 * one another, so "battle and chat, rooms silent" is a normal thing to run.
 *
 * 'incidental' is the catch-all, and it is a real category rather than a leftover
 * bucket: ambient room echoes ("The waves crash upon the shore while gulls scream
 * overhead"), skill-improvement lines and random stat-fluctuation flavor all just
 * appear while you stand still, share no structure worth matching, and are exactly
 * what you want silenced while idling somewhere noisy. Anything unrecognised lands
 * here too, so turning it off IS the allowlist behaviour and leaving it on is the
 * "speak the unusual" behaviour — the choice the old single-mode design made for
 * you in both directions.
 */
export type LineCategory = 'exploration' | 'battle' | 'communication' | 'incidental';

export const LINE_CATEGORIES: LineCategory[] = ['exploration', 'battle', 'communication', 'incidental'];

/** Which config key holds each category's toggle. */
const CATEGORY_CONFIG_KEYS: Record<LineCategory, string> = {
  exploration: 'speakExploration',
  battle: 'speakBattle',
  communication: 'speakCommunication',
  incidental: 'speakIncidental',
};

const CATEGORY_ICONS: Record<LineCategory, string> = {
  exploration: '🧭',
  battle: '⚔️',
  communication: '💬',
  incidental: '🍃',
};

const CATEGORY_LABELS: Record<LineCategory, string> = {
  exploration: 'Exploration',
  battle: 'Battle',
  communication: 'Communication',
  incidental: 'Incidental',
};

const ARENA_CONFIG_KEY = 'arenaObserverMode';

export interface SpeechToggles extends Record<LineCategory, boolean> {
  /**
   * Exclusive, unlike the four categories: Arena's pipeline is room-gated and
   * bypasses the squelch/prompt/category/include-exclude chain outright, so it
   * cannot compose with toggles that only exist inside that chain.
   */
  arena: boolean;
}

/** The four legacy single-mode values, expanded into the toggles that reproduce them. */
const LEGACY_MODE_TOGGLES: Record<string, Partial<Record<LineCategory, boolean>>> = {
  exploration: { exploration: true, battle: false, communication: false, incidental: true },
  battleFocus: { exploration: false, battle: true, communication: false, incidental: true },
  communication: { exploration: false, battle: false, communication: true, incidental: true },
  all: { exploration: true, battle: true, communication: true, incidental: true },
  // The original "read everything" value, from before any of this existed.
  off: { exploration: true, battle: true, communication: true, incidental: true },
};

/**
 * Expands a stored legacy mode into the equivalent toggle set.
 *
 * Used once, at enable time, to migrate an install that still has `speechMode` or
 * `combatMode` on disk. Anything unrecognised expands to everything on, for the
 * same reason it always has: an unreadable setting should speak more, not less.
 */
export function togglesForLegacyMode(raw: unknown): Record<LineCategory, boolean> {
  const key = typeof raw === 'string' ? raw : '';
  const found = LEGACY_MODE_TOGGLES[key] ?? LEGACY_MODE_TOGGLES.all;
  return {
    exploration: found.exploration ?? true,
    battle: found.battle ?? true,
    communication: found.communication ?? true,
    incidental: found.incidental ?? true,
  };
}

/**
 * Reads the toggles off a runtime config.
 *
 * `!== false` rather than `=== true`: a key that is absent means on. The four keys
 * are in configSchema.defaults so they normally exist, but a config saved before
 * they did will not carry them, and defaulting those to silence would leave the
 * plugin apparently broken until someone found the new switches.
 */
export function resolveSpeechToggles(cfg: Record<string, unknown>): SpeechToggles {
  return {
    exploration: cfg[CATEGORY_CONFIG_KEYS.exploration] !== false,
    battle: cfg[CATEGORY_CONFIG_KEYS.battle] !== false,
    communication: cfg[CATEGORY_CONFIG_KEYS.communication] !== false,
    incidental: cfg[CATEGORY_CONFIG_KEYS.incidental] !== false,
    arena: cfg[ARENA_CONFIG_KEY] === true || cfg.speechMode === 'arena',
  };
}

/**
 * How long the same affliction on the same target stays quiet after being called.
 *
 * A stun is not one line: a bash landing produces the knockdown echo, and the
 * following rounds re-echo it while the target is still down, so a single stun read
 * as "Grumbly is stunned." three or four times in six seconds. The previous guard
 * only suppressed an EXACT repeat of the immediately-preceding callout, so any other
 * line in between (a hit, a dodge) let the next one through.
 *
 * Long enough to cover a multi-round stun, short enough that a genuine re-stun after
 * the target got up is still called — being told twice is better than missing the
 * second one, so this errs short rather than long.
 */
const AFFLICTION_REPEAT_MS = 6_000;

/** Every combat-ish pattern, unlike ARENA_SQUELCH_RES which is only the noisy subset. */
const ALL_COMBAT_RES = COMBAT_PATTERNS.map((p) => new RegExp(p.pattern, 'm'));

export function isCommunicationLine(line: string): boolean {
  return classifyStrictChatSubtype(line) !== undefined;
}

export function isBattleLine(line: string): boolean {
  if (classifyEnemyAffliction(line)) return true;
  if (isWeaponFlagLine(line)) return true;
  return ALL_COMBAT_RES.some((re) => re.test(line));
}

/**
 * `inRoomBlock` is the caller's room-look render state (title or exits line seen,
 * no prompt since) — the only way to know a line is a room description, since the
 * text itself is arbitrary prose with no marker of any kind.
 *
 * Communication is tested FIRST because chat interleaves freely into a room render
 * — someone gossiping while you look does not become room content. Everything else
 * inside the block IS room content, which is why the block beats the battle test:
 * within a render, a line that happens to trip a combat pattern (an ambient arrival,
 * a mob description containing a damage verb) is part of what you are looking at.
 */
export function classifySpeechCategory(line: string, inRoomBlock: boolean): LineCategory {
  if (isCommunicationLine(line)) return 'communication';
  if (inRoomBlock) return 'exploration';
  if (isBattleLine(line)) return 'battle';
  return 'incidental';
}

/**
 * Third-person affliction echoes — a debuff or incapacitation landing on someone
 * who is NOT you.
 *
 * Why these are announced rather than just read: Battle Focus already lets most of
 * them through (Status/Incapacitation are deliberately not squelched), but it reads
 * the raw line, so "Grumbly is blinded by the dirt in his eyes!" arrives as a
 * sentence you have to parse out of a stream of other sentences. A short
 * "Grumbly is blinded." lands as an event. Two of them — the Stunning weapon-flag
 * knockdown and the poison procs — were not being spoken AT ALL, because
 * isArenaSquelchLine drops every weapon-flag proc as noise, and the stun is the
 * single most tactically important thing on this list.
 *
 * Every pattern here is taken from an already-corpus-verified table (Combat
 * Compression's Incapacitation/Status rules and Weapon Flag Squelch's proc rules),
 * NOT retyped from the community reference doc: the reference's ~90-spell affect
 * table is written from the victim's perspective ("You are blinded!") and so does
 * not detect anything landing on an enemy. Its third-person entries that no
 * verified table carries (the bash "fall flat on his face" family, mount rear,
 * heart blight's "stumbles in pain!") are deliberately left out until their full
 * line form is confirmed — a wrong anchor here speaks at the wrong moment, which
 * is worse than staying quiet.
 *
 * `subjectGroup` is which capture holds the AFFLICTED party: usually 1, but the
 * lifebane line reads "<weapon> coats <victim> with ...", where it is 2.
 */
interface AfflictionMatcher {
  re: RegExp;
  /** Spoken as "<subject> is <effect>." — phrased to read naturally after "is". */
  effect: string;
  subjectGroup: number;
  /** debuff = good news about your opponent; buff = bad news. Separately toggleable. */
  kind: 'debuff' | 'buff';
}

/**
 * ADMISSION RULE, applied to every row below: a line earns a place here only if
 * knowing it would CHANGE WHAT YOU DO — a lost round, a lost weapon, halved
 * damage, a spell that will now fail. "Something happened to the enemy" is not
 * enough. Two consequences worth stating, because both cost real candidates:
 *
 *  - NO PER-ROUND TICKS. The corpus-verified poison and plague ticks ("X shivers
 *    and suffers." 6,385 hits, "X writhes in agony as plague sores erupt from its
 *    skin." 844) re-fire every round for the whole duration. The LANDING is the
 *    news; the tick is the same news repeated until the fight ends. They would
 *    dominate the channel even through the 6s debounce, so only landings are here.
 *  - NO EFFECTS I CANNOT STATE. Warcry ("X screams a massive warcry!", 241 hits)
 *    is corpus-verified and left out anyway, because what it mechanically does to
 *    the fight is unclear — announcing it would be noise wearing a signal's coat.
 *
 * Every pattern is corpus-verified: from Combat Compression / Weapon Flag Squelch
 * (already proven), or recovered in the 2026-08-02 full-corpus pass with hit
 * counts recorded in @reference-data/PatternMap.yaml. Nothing is transcribed from
 * the community reference's ~90-spell affect table, which is written victim-side
 * ("You are blinded!") and cannot see anything landing on someone else.
 *
 * `subjectGroup` is which capture holds the affected party — usually 1, but three
 * lines here name the ACTOR first ("<weapon> coats <victim>", "<X> tosses <Y>",
 * "<X> disarms <Y>"), where it is 2.
 */
const ENEMY_AFFLICTION_MATCHERS: AfflictionMatcher[] = [
  // ── Lost rounds ────────────────────────────────────────────────────────────
  { re: /^([\w\-\s,']+?) is sent flying by the impact!$/, effect: 'bashed', subjectGroup: 1, kind: 'debuff' },
  { re: /^([\w\-\s,']+?)'s muscles stop responding\.$/, effect: 'paralyzed', subjectGroup: 1, kind: 'debuff' },
  { re: /^([\w\-\s,']+?) is slammed directly in the face!$/, effect: 'stunned', subjectGroup: 1, kind: 'debuff' },
  // Stunning weapon flag. The whole reason this classifier runs BEFORE the squelch.
  { re: /^([\w\-\s,'"]+?) is knocked to the ground by [\w\-\s,'"]+\.$/, effect: 'stunned', subjectGroup: 1, kind: 'debuff' },
  // Toss. Corpus-recovered 2026-08-02 (1,482 hits) — the reference carried only the
  // bare "into the air!" fragment, which is unmatchable on its own.
  { re: /^[\w\-\s,']+? tosses ([\w\-\s,']+?) into the air!$/, effect: 'thrown into the air', subjectGroup: 1, kind: 'debuff' },

  // ── Degraded offence ───────────────────────────────────────────────────────
  { re: /^([\w\-\s,']+?) is blinded by the dirt in (?:his|her|its) eyes!$/, effect: 'blinded', subjectGroup: 1, kind: 'debuff' },
  // Spit variant, corpus-recovered 2026-08-02. No neuter form exists (his/her only,
  // unlike the dirt version) — adding one would be a pattern that can never fire.
  { re: /^([\w\-\s,']+?) is blinded by the spit in (?:his|her) eyes!$/, effect: 'blinded', subjectGroup: 1, kind: 'debuff' },
  { re: /^([\w\-\s,']+?) starts to move in slow motion\.$/, effect: 'slowed', subjectGroup: 1, kind: 'debuff' },
  // Disarms. Losing a weapon or shield mid-fight is among the largest single swings
  // on this list, and neither was announced before.
  { re: /^[\w\-\s,']+? disarms ([\w\-\s,']+?)!$/, effect: 'disarmed', subjectGroup: 1, kind: 'debuff' },
  { re: /^([\w\-\s,']+?) has [\w\-\s,']+? knocked loose from their hands by [\w\-\s,']+?!$/, effect: 'stripped of their shield', subjectGroup: 1, kind: 'debuff' },

  // ── Degraded defence / sustain ─────────────────────────────────────────────
  { re: /^([\w\-\s,']+?) is surrounded by a pink outline\.$/, effect: 'outlined in faerie fire', subjectGroup: 1, kind: 'debuff' },
  // Poison procs — squelched as weapon-flag noise before this existed. LANDINGS only.
  { re: /^([\w\-\s,']+?) is poisoned by the venom on [\w\-\s,']+\.$/, effect: 'poisoned', subjectGroup: 1, kind: 'debuff' },
  // NOT the lifebane "coats" line. Both the reference and PatternMap read it as
  // "<weapon> coats <victim>", but real traffic is "Karotte coats a grand arcanium
  // dagger with deadly lifebane poison." — a PLAYER applying poison to their OWN
  // BLADE. There is no victim in it, and announcing "a grand arcanium dagger is
  // poisoned." would be both true and useless. Verified against 16 distinct corpus
  // wordings, every one of them player-coats-weapon.
  // Plague landing, corpus-recovered 2026-08-02. ANCHORED: the unanchored form
  // captured "shivers and" as the subject off the combined ". shivers and looks
  // very ill." variant, so it would have announced a fragment as a combatant.
  { re: /^([\w\-\s,']+?) looks very ill\.$/, effect: 'plagued', subjectGroup: 1, kind: 'debuff' },
  { re: /^([\w\-\s,']+?) looks very weak as their ability to heal is drained\.$/, effect: 'unable to heal', subjectGroup: 1, kind: 'debuff' },

  // ── BUFFS on your opponent: bad news, and each one changes the maths ────────
  // Previously excluded wholesale as "not an affliction". That was right for
  // sanctuary-on-a-groupmate and wrong for sanctuary-on-the-thing-you-are-hitting:
  // it halves your damage, and not knowing is how a fight quietly stops working.
  { re: /^([\w\-\s,']+?) is surrounded by a white aura\.$/, effect: 'protected by sanctuary', subjectGroup: 1, kind: 'buff' },
  { re: /^([\w\-\s,']+?)'s skin turns to stone\.$/, effect: 'stone skinned', subjectGroup: 1, kind: 'buff' },
  { re: /^([\w\-\s,']+?) is moving more quickly\.$/, effect: 'hasted', subjectGroup: 1, kind: 'buff' },
  // Corpus-recovered 2026-08-02. Note the missing possessive ("surrounds a yinn
  // warrior body") — that is the game's own wording, not a typo to fix.
  { re: /^A mystical shield glimmers as it surrounds ([\w\-\s,']+?) body\.$/, effect: 'shielded against magic', subjectGroup: 1, kind: 'buff' },
  // Charm breaking mid-fight changes who is fighting whom. Corpus-recovered
  // 2026-08-02 — note there is no possessive, unlike the reference's self wording.
  { re: /^([\w\-\s,']+?) regains free will\.$/, effect: 'free of charm', subjectGroup: 1, kind: 'buff' },
];

/**
 * A bare "You" subject is excluded: self-stun has its own announcement path and its
 * own toggle, so matching here as well would speak one event twice in two wordings.
 *
 * Only the exact word, NOT a "your ..." prefix. The self forms of these lines read
 * "You ARE knocked to the ground", so they miss the "is" patterns above anyway and
 * this is mostly belt-and-braces — but "Your pet is knocked to the ground by X." is
 * a real third-party line about a real combatant, and a `^your\b` guard would
 * silently swallow every one of them.
 */
const SELF_SUBJECT_RE = /^you$/i;

export function classifyEnemyAffliction(
  line: string,
): { subject: string; effect: string; kind: 'debuff' | 'buff' } | undefined {
  for (const m of ENEMY_AFFLICTION_MATCHERS) {
    const hit = m.re.exec(line);
    if (!hit) continue;
    const subject = (hit[m.subjectGroup] ?? '').trim();
    if (!subject || SELF_SUBJECT_RE.test(subject)) return undefined;
    return { subject, effect: m.effect, kind: m.kind };
  }
  return undefined;
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

/**
 * How long an unclassifiable line waits to see whether a `game:room-data` event
 * arrives behind it and reveals it to have been part of a room render.
 *
 * The room render's only reliable marker is a TRAILING one — the GMCP event that
 * follows it — and a trailing marker cannot classify text at arrival time.
 * Something has to wait. This is that wait.
 *
 * MEASURED, not guessed. Across 207 docker game-server logs (341,481 room_data
 * events), the gap from a render's first line to its room_data event is p50 1ms,
 * p95 5ms, p99 8ms, max 89ms — nothing above 250ms, and nothing close. The margin
 * is deliberately wide because the cost of overshooting is nil: the timer only
 * runs out when there was no render, which is ambient flavor text where a late
 * release costs nothing.
 */
const ROOM_RENDER_CONFIRM_MS = 250;

/**
 * Finds where a room render begins inside a batch of held lines, given the room
 * name from the `game:room-data` event that arrived behind them. Returns -1 when
 * the batch contains no render at all.
 *
 * TWO THINGS ARE MEASURED HERE, both of which cost a rewrite when guessed.
 *
 * 1. THE ARRIVAL OF room_data IS NOT THE SIGNAL. DSL emits room_data (and
 *    char_data) before EVERY prompt, not only after a render — of 341,481 events
 *    across 207 docker logs, only ~9% follow one. The rest trail equipment lists,
 *    auction chat, "You are thirsty.". So the NAME discriminates, not the event.
 *
 * 2. THE TITLE IS OFTEN NOT THE FIRST LINE, which is the failure this function
 *    exists to fix. Anchoring on held[0] missed 6,170 of 37,997 real renders in
 *    the corpus — 16.2%, one room in six — because so much arrives ahead of the
 *    title in the same window:
 *      "You enter a dark glowing orb."                     (portals: 23% of them)
 *      "You wake and stand up."
 *      "Just as you start to leave, a fountain of blood erupts from the altar."
 *      a chat line landing mid-render
 *      an entire multi-room drift sequence, several renders in one window
 *    Scanning for the name instead drops the miss rate to 283 (0.74%).
 *
 * LAST match, not first: when a window holds several renders (river drift, a
 * login dump), the one this event describes is the final one. Lines BEFORE the
 * index are not part of the render and are released separately — "You enter a
 * dark glowing orb." is not room description and should not be silenced with it.
 *
 * Equality against the whole line, never containment: a chat line quoting a room
 * name must not open a render. Corpus-checked, the rule produced no false
 * positives — every window it matched also carried an `[Exits:]` line, bar 20
 * short brief-mode renders that legitimately have none.
 */
export function roomRenderStartIndex(held: readonly string[], gmcpRoomName: string): number {
  const name = String(gmcpRoomName ?? '').trim().toLowerCase();
  if (!name) return -1;
  for (let i = held.length - 1; i >= 0; i--) {
    if (String(held[i] ?? '').trim().toLowerCase() === name) return i;
  }
  return -1;
}

// volume=0 makes the actual text inaudible — only its presence/duration
// matters (see the primer-utterance comment in pump() below) — but a
// single space risks some engines collapsing it to zero duration and
// defeating the point, so this is a short throwaway word instead.
const PRIMER_UTTERANCE_TEXT = 'hm';

/**
 * Commands whose output is unspeakable by nature — ASCII art, tables, anything
 * whose meaning is in its LAYOUT rather than its words. `map` renders a grid of
 * `#`/`%`/`@` that the synthesizer reads as a minute of punctuation noise.
 *
 * Two patterns, not one, so the shape of the list is obvious to anyone editing
 * it: a bare command, and a command with an argument.
 */
export const DEFAULT_COMMAND_GATE_PATTERNS = 'map\nmap \\d+';
export const DEFAULT_COMMAND_GATE_MS = 500;

/**
 * A command gate is NOT an exclude pattern, and conflating the two is the easy
 * mistake here. An exclude pattern matches OUTPUT and drops the lines it matches;
 * it needs you to describe the noise. A gate matches INPUT and drops everything
 * for a while afterwards; it needs you to describe only the command. That is the
 * whole point for output like a map, where the noise has no stable text to
 * describe — the rows differ every room and consist mostly of symbols.
 *
 * Matching rules, all of them chosen to avoid gating things you did not ask to
 * gate:
 *
 *  - IMPLICITLY ANCHORED (`^(?:…)$`) against the whole input. This is the
 *    important one. A substring match on `map` would gate `unmap`, `maple syrup`,
 *    and `say the map is wrong` — silencing speech for half a second every time
 *    you happened to type those letters, with no visible cause. Users who
 *    genuinely want a prefix match can still write `map.*`.
 *  - Case-insensitive, since MUD commands are.
 *  - Internal whitespace runs in the INPUT collapse to single spaces first, so
 *    the plain-looking default `map \d+` still gates `map   3`. Without this the
 *    default would silently not fire on a double space and look broken.
 *  - An entry that will not compile as a regex falls back to exact
 *    (case-insensitive) equality rather than being dropped — same
 *    invalid-regex-is-a-literal courtesy the include/exclude lists give, except
 *    equality rather than substring, because anchoring is the point.
 *  - `#` comments and blank lines are ignored, so the list can be annotated.
 */
export function matchesCommandGate(input: string, rawPatterns: string): boolean {
  const normalized = input.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;

  for (const raw of String(rawPatterns ?? '').split('\n')) {
    const entry = raw.trim();
    if (!entry || entry.startsWith('#')) continue;
    let re: RegExp;
    try {
      re = new RegExp(`^(?:${entry})$`, 'i');
    } catch {
      if (entry.toLowerCase() === normalized.toLowerCase()) return true;
      continue;
    }
    if (re.test(normalized)) return true;
  }
  return false;
}

export function createTextToSpeechPlugin(): IPluginModule {
  let queue: string[] = [];
  let speaking = false;
  let controlsGroup: HTMLDivElement | null = null;
  let readButton: HTMLButtonElement | null = null;
  let stopButton: HTMLButtonElement | null = null;
  let pauseButton: HTMLButtonElement | null = null;
  let modesButton: HTMLButtonElement | null = null;
  let modesPanel: HTMLDivElement | null = null;
  let arenaButton: HTMLButtonElement | null = null;
  let panelOpen = false;
  const categoryButtons = new Map<LineCategory, HTMLButtonElement>();
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
  /**
   * Room-look render tracking for the normal play stream (Bloodbath has its own
   * pair above, gated to that one room).
   *
   * `recentRoomNames` is a small ring, not a single value, because the render and
   * the room-data event that names it are two independent streams with no ordering
   * guarantee: on movement the title line can arrive before its GMCP event, in which
   * case the CURRENT name is still the previous room's. Keeping the last few names
   * means the title matches whichever of the two got there first.
   */
  let inRoomBlock = false;
  /**
   * When each target+effect was last announced, for the repeat debounce.
   *
   * Pruned rather than left to grow: a long session against many mobs would
   * otherwise accumulate an entry per name forever, and every entry older than the
   * window is dead weight by definition.
   */
  const afflictionSpokenAt = new Map<string, number>();
  const rememberAfflictionSpoken = (key: string, now: number) => {
    afflictionSpokenAt.set(key, now);
    if (afflictionSpokenAt.size <= 64) return;
    for (const [k, at] of afflictionSpokenAt) {
      if (now - at >= AFFLICTION_REPEAT_MS) afflictionSpokenAt.delete(k);
    }
  };
  const recentRoomNames: string[] = [];
  const rememberRoomName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || recentRoomNames[0] === trimmed) return;
    recentRoomNames.unshift(trimmed);
    while (recentRoomNames.length > 4) recentRoomNames.pop();
  };
  const isKnownRoomName = (line: string) => recentRoomNames.includes(line.trim());
  /**
   * The in-flight defer timer from pump(), and a generation counter that
   * invalidates it.
   *
   * pump() speaks on a timer rather than synchronously (see the clipping notes
   * there), which means there is always a window where a speak() is scheduled
   * but has not happened. Anything that stops or resets speech has to be able
   * to reach into that window — otherwise it clears the queue, the timer fires
   * anyway, and the utterance it captured speaks regardless.
   *
   * The generation counter exists because clearTimeout is not sufficient on its
   * own: a timer that has ALREADY fired and is waiting its turn on the event
   * loop cannot be cleared, so the callback re-checks that its generation is
   * still current before touching the synthesizer.
   */
  let deferTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The in-flight utterance's stall watchdog (armed in pump()). Lives out here, not
   * inside pump(), purely so stopSpeaking() can disarm it — see the note there.
   */
  let activeWatchdog: ReturnType<typeof setTimeout> | null = null;
  /**
   * The in-flight utterance's keepalive (armed in pump() only for utterances long
   * enough at the current rate to reach the engine's stall window). Hoisted for
   * the same reason as the watchdog: a repeating timer that outlives its
   * utterance would go on pausing and resuming whatever is speaking next.
   */
  let activeKeepalive: ReturnType<typeof setInterval> | null = null;
  /**
   * User-held pause (the pause bubble), as distinct from mute/stop.
   *
   * Stop is momentary: cancel the current utterance, drop the queue, carry on
   * listening. Pause is a HELD state — the engine stays paused and the plugin stays
   * silent until the user presses play, and lines arriving in between are DISCARDED
   * rather than buffered, so play resumes live commentary instead of replaying a
   * backlog. What survives a pause is only the utterance already in flight, which
   * continues from where it stopped.
   *
   * Every path that could restart the synthesizer has to respect this, and there are
   * three that would otherwise fight it: the keepalive's resume(), the pre-speak
   * resume() nudge in the defer timer, and pump() itself pulling the next line.
   */
  let userPaused = false;
  /**
   * Wall-clock deadline set by onAlias when you type a gated command (see
   * matchesCommandGate). Speech stays off until it passes.
   *
   * A deadline rather than a boolean + timer on purpose: nothing has to be
   * cancelled on disable, on pause, or when a second gated command lands inside
   * the first one's window — the later command simply pushes the deadline out.
   * A timer would need clearing in all three places, and forgetting one leaves
   * speech muted with no way to tell why.
   *
   * Starts at INPUT time, not at first output, because the round trip is part of
   * what has to be covered — the map body starts arriving before anything the
   * plugin could use as a "here comes the map" marker.
   */
  let commandGateUntil = 0;
  let speakGeneration = 0;

  /**
   * Deliberately reads the clock every call rather than caching: the whole
   * mechanism is a time window, and a stale read at the boundary either clips the
   * tail of the gated output or holds silence past it.
   */
  const isCommandGated = () => commandGateUntil > Date.now();

  const stopKeepalive = () => {
    if (activeKeepalive !== null) {
      clearInterval(activeKeepalive);
      activeKeepalive = null;
    }
  };
  // Battle Focus mode only — debuff names currently announced via
  // game:affect-added, so game:affect-removed only speaks a wear-off for
  // ones we actually flagged (never for buffs, which this channel ignores).
  let trackedSelfDebuffs = new Set<string>();

  /**
   * Lines held back because they MIGHT be a room render — see
   * ROOM_RENDER_CONFIRM_MS and releaseRoomCandidate below.
   *
   * Only 'incidental' lines land here, which is what keeps the cost off everything
   * else: battle, communication and already-confirmed exploration lines are
   * identifiable on sight and go straight through. 'incidental' is the catch-all
   * bucket, and an unrecognised room title or description is exactly what falls
   * into it, so it is the only bucket where waiting buys anything.
   */
  let roomCandidateLines: string[] = [];
  let roomCandidateTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRoomCandidate = () => {
    roomCandidateLines = [];
    if (roomCandidateTimer !== null) {
      clearTimeout(roomCandidateTimer);
      roomCandidateTimer = null;
    }
  };

  /**
   * Drops everything WAITING to be spoken: the queue proper plus the half-built
   * group still inside its debounce window. Both stop and pause need exactly this,
   * and forgetting the group buffer leaves a burst that flushes seconds later into
   * a queue that was supposed to be empty.
   */
  const discardQueued = () => {
    queue = [];
    pendingLines = [];
    groupStartedAt = null;
    if (groupTimer !== null) {
      clearTimeout(groupTimer);
      groupTimer = null;
    }
    // Third buffer, same rule. Held candidates are further from speech than the
    // group is, but they still reach it — pausing and then hearing a room
    // description a quarter-second later is the same bug the group buffer had.
    clearRoomCandidate();
  };

  const stopSpeaking = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    // pump() does not speak immediately — it arms a timer and speaks when that
    // fires. Clearing the queue without disarming that timer left a speak()
    // in flight that stop could not reach: ~150ms after stopping, the line
    // still spoke, and its onend re-entered pump() and drained the queue that
    // had just been emptied. Bumping the generation makes any already-fired
    // timer a no-op too, which clearTimeout alone cannot do.
    speakGeneration += 1;
    if (deferTimer !== null) {
      clearTimeout(deferTimer);
      deferTimer = null;
    }
    // The stall watchdog is the OTHER timer pump() leaves in flight, and it was
    // never disarmed here. It then fired up to (5s + 120ms/char) after the stop —
    // typically on an instance that had already been torn down — logged a recovery,
    // cleared `speaking` and re-entered pump() against the queue this line just
    // emptied. That is the stray "pump: queue empty" with no utterance before it.
    if (activeWatchdog !== null) {
      clearTimeout(activeWatchdog);
      activeWatchdog = null;
    }
    // Same hazard, worse: an orphaned keepalive is a REPEATING timer, so it would
    // keep pausing/resuming the synthesizer every 10s for the rest of the session.
    stopKeepalive();
    discardQueued();
    speaking = false;
  };

  const isDebug = (api: PluginRuntimeApi) => api.getConfig().debug === true;

  const pump = (api: PluginRuntimeApi) => {
    // Every exit from here is logged *when debug is on*. Silence with a queue that
    // keeps filling has exactly three causes and they need completely different
    // fixes, but from the outside they are indistinguishable — the log showed lines
    // being queued and then simply nothing, which is what sent several rounds of
    // guessing at the speak() call when the function may never have reached it.
    // None of it is actionable to someone whose speech is working, so it stays
    // behind the toggle rather than in the terminal by default.
    // Checked before `speaking`, so a pause taken mid-utterance does not read as a
    // wedged pump: nothing is broken, the queue is deliberately being held.
    if (userPaused) {
      if (isDebug(api)) api.log('pump held: paused by the user');
      return;
    }
    if (speaking) {
      if (isDebug(api)) api.error('pump skipped: still marked speaking (a previous utterance never ended)');
      return;
    }
    const Synth = window.speechSynthesis;
    if (!Synth) {
      if (isDebug(api)) api.error('pump aborted: window.speechSynthesis is unavailable in this browser/context');
      return;
    }

    let next = queue.shift();
    if (next === undefined) {
      if (isDebug(api)) api.log('pump: queue empty');
      return;
    }

    const cfg = api.getConfig();
    // Clamped, not just coerced — see the note on pitch/volume below. Resolved
    // HERE rather than with the other utterance properties because the cap and
    // both timers are derived from it: how much text fits in the engine's time
    // budget is a function of how fast that text is spoken.
    const rate = clampNumber(cfg.rate, 1, 0.1, 10);
    const keepaliveEnabled = cfg.longUtteranceKeepalive !== false;
    const maxChars = maxUtteranceCharsFor(rate, keepaliveEnabled);

    // Long utterances fail in Chrome — often silently, sometimes stalling partway
    // with no end event, which also wedges the pump because onend never fires.
    // A grouped room description is exactly that case: the whole look block
    // arrives as ONE queued item well over a thousand characters.
    //
    // Split at speak time rather than at enqueue, deliberately: maxQueueLength
    // counts LOGICAL lines, so chunking earlier would let one room description
    // blow past the cap and evict itself down to its last few fragments.
    // Splitting here leaves that accounting untouched — the remainder goes back
    // to the FRONT of the queue and is spoken next, in order. It also means the
    // cap is applied at the rate in force NOW, not the one saved when the line
    // was queued.
    if (next.length > maxChars) {
      const [head, rest] = splitForSpeech(next, maxChars);
      next = head;
      if (rest) queue.unshift(rest);
    }

    const utter = new SpeechSynthesisUtterance(next);

    const voiceName = String(cfg.voiceName ?? '').trim();
    if (voiceName) {
      const voice = Synth.getVoices().find((v) => v.name === voiceName);
      if (voice) utter.voice = voice;
    }
    // Clamped, not just coerced. Number('') is 0 and Number(undefined) is NaN, so a
    // config field that has been cleared — or saved as a string by an older build —
    // silently produced volume 0 or rate 0. Both are inaudible, and neither raises
    // an error: the utterance starts, ends, and you hear nothing, which looks
    // identical to speech being broken outright. Out-of-range values are equally
    // bad (the spec ranges are rate 0.1-10, pitch 0-2, volume 0-1; Chrome refuses
    // an utterance outside them rather than clamping).
    utter.rate = rate;
    utter.pitch = clampNumber(cfg.pitch, 1, 0, 2);
    utter.volume = clampNumber(cfg.volume, 1, 0, 1);

    speaking = true;

    /**
     * Watchdog against a permanently stuck queue.
     *
     * `speaking` is only ever cleared by onend/onerror, so an utterance the engine
     * accepts and then never finishes latches it true — and because pump() opens
     * with `if (speaking) return`, EVERY later line is queued and silently
     * dropped. One lost end event kills speech for the rest of the session, which
     * is exactly the observed failure: "Queueing (grouped)" repeating forever with
     * no audio and no error.
     *
     * Chrome loses these events in several documented ways (a speak() issued in
     * the same tick as cancel(), an over-long utterance, the ~15s idle bug), so
     * rather than trusting any one of those to be fixed, the queue is made
     * self-healing: if neither event arrives in the time this utterance could
     * plausibly take, assume it is gone and move on.
     *
     * Budget is generous on purpose — a false trigger would cut off real speech,
     * which is worse than a late recovery.
     */
    // Derived from the rate-aware estimate, not a flat per-character figure. The
    // old `5s + 120ms/char` also modelled rate 1, so at a slow rate it expired
    // while the utterance was still legitimately speaking — and this watchdog's
    // "recovery" is to pump the NEXT line, which then spoke over the top of it.
    // 2.5x the estimate keeps a false trigger far away; a late recovery is much
    // cheaper than cutting off real speech.
    const estimatedSeconds = speechSecondsFor(next, rate);
    const budgetMs = 5_000 + estimatedSeconds * 2.5 * 1_000;
    // Captured before ANYTHING is scheduled. stopSpeaking() bumps speakGeneration,
    // and every callback this pump arms re-checks it, so a stop — including the one
    // the plugin's disable path performs — invalidates the whole batch rather than
    // just the pieces clearTimeout happens to be able to reach.
    const generation = speakGeneration;
    let settled = false;
    const settle = () => {
      if (settled) return true;
      settled = true;
      if (activeWatchdog !== null) {
        clearTimeout(activeWatchdog);
        activeWatchdog = null;
      }
      stopKeepalive();
      return false;
    };
    // Hoisted to the plugin closure so stopSpeaking() can disarm it. Left local, it
    // outlived every stop: the utterance was cancelled and the queue emptied, then
    // seconds later this fired on a torn-down instance, cleared `speaking` and
    // re-entered pump() — which found the queue it had itself just emptied.
    const onWatchdog = () => {
      if (settled) return;
      // A user pause stops this clock rather than the utterance. The budget assumes
      // continuous speech, so holding for a minute would look exactly like a stall —
      // and this watchdog's "recovery" is to move on, which would silently skip the
      // very line the user paused in the middle of.
      if (userPaused) {
        activeWatchdog = setTimeout(onWatchdog, budgetMs);
        return;
      }
      settled = true;
      activeWatchdog = null;
      // Unconditionally, and before the generation check below: this path does not
      // go through settle(), so it is the one place an armed keepalive could
      // outlive the utterance that armed it.
      stopKeepalive();
      if (generation !== speakGeneration) return;
      if (isDebug(api)) api.error(`utterance produced no end event after ${Math.round(budgetMs / 1000)}s — recovering`);
      speaking = false;
      pump(api);
    };
    activeWatchdog = setTimeout(onWatchdog, budgetMs);

    /**
     * Keepalive against Chrome/Edge's ~15s stall.
     *
     * pause() immediately followed by resume() restarts the engine's internal
     * timer without moving the playback position — the standard workaround, and
     * what makes utterances longer than UNASSISTED_UTTERANCE_SECONDS viable at all.
     *
     * Armed on the RATE-AWARE estimate rather than on length: 400 characters is
     * over the line at rate 1 and comfortably under it at rate 3, and an utterance
     * that will finish inside the window gains nothing from this while still
     * paying for it — pause()/resume() is audible as a slight hitch on some
     * voices, so the cheapest keepalive is the one that never runs.
     */
    if (keepaliveEnabled && estimatedSeconds > UNASSISTED_UTTERANCE_SECONDS) {
      activeKeepalive = setInterval(() => {
        // A tick that finds its utterance finished or superseded disarms itself.
        // clearInterval from settle()/stopSpeaking() covers the normal cases; this
        // is the backstop for a tick already queued on the event loop when they ran.
        if (settled || generation !== speakGeneration) {
          stopKeepalive();
          return;
        }
        // NOT while the user has it paused — this tick's resume() would restart
        // speech behind their back, and it fires every 10s, so the pause button
        // would appear to work for a moment and then undo itself.
        if (userPaused) return;
        try {
          Synth.pause();
          Synth.resume();
        } catch {
          // ignore — a synthesizer that refuses these is one this cannot help
        }
      }, KEEPALIVE_INTERVAL_MS);
    }

    utter.onend = () => {
      if (settle()) return;
      if (generation !== speakGeneration) return;
      speaking = false;
      pump(api);
    };
    utter.onstart = () => {
      if (isDebug(api)) api.log(`utterance started (${next!.length} chars)`);
    };
    utter.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (settle()) return;
      // Behind the debug flag. This was unconditional so a synthesizer that accepts
      // an utterance and then refuses it wouldn't look identical to the plugin never
      // having tried — but the common case is `interrupted`, which every stop/cancel
      // produces during perfectly healthy operation, so the diagnostic value never
      // paid for the noise it put in the terminal.
      if (isDebug(api)) api.error(`utterance failed: ${e.error ?? 'unknown'}`);
      if (generation !== speakGeneration) return;
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
    deferTimer = setTimeout(() => {
      deferTimer = null;
      // Stopped, reset, or superseded while this timer was pending — say nothing.
      // Without this, stopSpeaking() cleared the queue but this callback still
      // spoke the line it had already captured, and its onend then re-entered
      // pump() and kept draining. Checked again here rather than relying on
      // clearTimeout alone, because a timer that has already fired and is
      // queued on the event loop is past the point clearTimeout can reach.
      if (generation !== speakGeneration) return;
      // Paused between arming this timer and its firing. Dropped like anything else
      // that arrives while paused — re-queueing it would put the one line back that
      // setPaused just cleared, and it would then be the stalest thing spoken on
      // play. Falling through is not an option either: the resume() immediately
      // below is precisely the call that would undo the pause.
      if (userPaused) {
        settle();
        speaking = false;
        return;
      }
      try {
        Synth.resume();
      } catch {
        // ignore
      }
      // NO cancel() here — it used to run immediately before the speak() calls
      // below, and that is a documented way to lose the utterance entirely:
      // Chrome drops a speak() issued in the same tick as a cancel(), silently,
      // with no error event. It was added to fight start-of-word clipping, but
      // it costs the whole utterance rather than its first phoneme, and the
      // mobile port had already rejected the same trick for the same reason
      // ("a cancel() before each speak would tear down the queue this plugin
      // depends on"). The defer + resume() above remain; the near-silent primer
      // below still absorbs the engine's start-of-buffer clip on its own.
      const primer = new SpeechSynthesisUtterance(PRIMER_UTTERANCE_TEXT);
      primer.volume = 0;
      primer.rate = utter.rate;
      primer.voice = utter.voice;
      Synth.speak(primer);
      Synth.speak(utter);
    }, deferMs);
  };

  /**
   * The pause bubble's entry point. Deliberately NOT stopSpeaking() with extra
   * steps: nothing is cancelled and nothing is dropped, so an utterance paused
   * halfway through resumes from where it stopped rather than restarting or
   * vanishing, and lines that arrive while paused are still there on play.
   */
  const setPaused = (api: PluginRuntimeApi, next: boolean) => {
    if (userPaused === next) return;
    userPaused = next;
    // Pausing drops whatever was already waiting, and enqueue() drops whatever
    // arrives while paused. Speech is live commentary — a backlog spoken on play is
    // a description of a room you left and a fight that already ended, and worse, it
    // delays the lines that actually matter behind it.
    if (next) discardQueued();
    try {
      if (next) window.speechSynthesis?.pause();
      else window.speechSynthesis?.resume();
    } catch {
      // A synthesizer that refuses pause/resume still honours the flag: pump() is
      // held either way, so the worst case is the CURRENT utterance finishing.
    }
    // Resuming mid-utterance needs no nudge — the engine picks that up itself and
    // its onend drives the queue again. Resuming with nothing in flight needs one
    // only in case a line landed in the same tick as the unpause; the queue is
    // normally empty here, and pump() on an empty queue is a no-op.
    if (!next && !speaking) pump(api);
  };

  const isPaused = () => userPaused;

  const enqueue = (api: PluginRuntimeApi, text: string) => {
    // Paused means off-duty, not buffering — the line is discarded, not held. This
    // is the single funnel every speech path reaches, so one check covers game
    // lines, health/tick alerts and the read-selection button alike. (That last one
    // included on purpose: while paused, pressing read does nothing rather than
    // queueing something to surprise you on play.)
    if (userPaused) {
      if (isDebug(api)) api.log(`dropped (paused): "${text}"`);
      return;
    }
    // Same funnel logic as pause, for the direct callers queueLine never sees:
    // the health/tick/stun alerts and the read-selection button. Gated output is
    // dropped, never deferred — the point of a gate is that the map you just
    // asked for is worthless read aloud, so replaying it late is worse than
    // silence, not better.
    if (isCommandGated()) {
      if (isDebug(api)) api.log(`dropped (command gate): "${text}"`);
      return;
    }
    // Sanitized here, at the one funnel every speech path goes through, rather
    // than at each caller — a GMCP-derived alert, the read-selection button or
    // a line another plugin echoed back into the stream can all carry escape
    // sequences, and the synthesizer reads them out loud ("one semicolon
    // thirty-seven em") instead of ignoring them.
    const speakable = stripAnsiForSpeech(text).trim();
    // A line that was nothing but escape codes has nothing to say, and an
    // empty utterance is not worth a queue slot (some engines never fire
    // onend for one, which would stall the pump).
    if (!speakable) return;

    const maxLen = Math.max(1, Number(api.getConfig().maxQueueLength ?? 3));
    queue.push(speakable);
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
    // Gated HERE as well as in enqueue(), and the duplication is load-bearing.
    // Grouping means a line can arrive inside the gate window but not reach
    // enqueue() until after it — every new line pushes the flush out another
    // groupWindowMs, so a map body arriving over 400ms with a 300ms window
    // flushes at ~700ms and would sail past a 500ms gate. Dropping on ARRIVAL
    // also keeps gated rows from joining a group at all, so they cannot drag a
    // legitimate line that follows them into the same discarded utterance.
    if (isCommandGated()) {
      if (isDebug(api)) api.log(`dropped (command gate): "${line}"`);
      return;
    }
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
   * Decides what the held lines actually were, and lets them go.
   *
   * `asRoomRender` true  — a game:room-data event arrived behind them, so the text
   *                        immediately before it was a room render. They are
   *                        exploration, whatever they looked like individually.
   * `asRoomRender` false — the wait elapsed with no room-data event. They were
   *                        never a render; they are ordinary incidental lines.
   *
   * Either way the toggle for the resolved category decides speech, so this is a
   * classification fix and not a new bypass: turning exploration off still silences
   * a confirmed render, and turning incidental off still silences ambient text.
   * What changes is that the two stop being confused for each other.
   */
  const releaseAs = (api: PluginRuntimeApi, lines: readonly string[], category: LineCategory) => {
    if (lines.length === 0) return;
    if (!resolveSpeechToggles(api.getConfig())[category]) {
      if (isDebug(api)) api.log(`Skipped (${category} lines are switched off): ${lines.length} held line(s)`);
      return;
    }
    if (isDebug(api)) api.log(`Released ${lines.length} held line(s) as ${category}`);
    for (const line of lines) queueLine(api, line);
  };

  const releaseRoomCandidate = (api: PluginRuntimeApi, renderStart: number) => {
    const held = roomCandidateLines;
    clearRoomCandidate();
    if (held.length === 0) return;

    // No render in the batch — the wait elapsed, or room_data named a room whose
    // title never appeared. Ordinary incidental text.
    if (renderStart < 0) {
      releaseAs(api, held, 'incidental');
      return;
    }
    // A render preceded by other output is the common case, not the exception
    // (15.7% of detections in the corpus). The two halves are genuinely different
    // kinds of line and get their own categories: silencing exploration should not
    // also silence "You enter a dark glowing orb.", which is how you learn the
    // portal worked.
    releaseAs(api, held.slice(0, renderStart), 'incidental');
    releaseAs(api, held.slice(renderStart), 'exploration');
  };

  /**
   * Holds a line that could belong to a room render.
   *
   * The timer is refreshed rather than left to run from the first line, because a
   * render arrives as several lines and the GMCP follows the LAST of them — a fixed
   * window measured from the title could lapse mid-description and split one render
   * across both outcomes, speaking half of it and dropping the rest.
   */
  const holdRoomCandidate = (api: PluginRuntimeApi, line: string) => {
    roomCandidateLines.push(line);
    if (roomCandidateTimer !== null) clearTimeout(roomCandidateTimer);
    roomCandidateTimer = setTimeout(() => releaseRoomCandidate(api, -1), ROOM_RENDER_CONFIRM_MS);
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
    opts: { dropChatLines: boolean; speakConditionLines: boolean; announceAfflictions: boolean; announceBuffs: boolean },
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

    // Checked BEFORE the squelch below, and that ordering is the whole point: the
    // Stunning weapon-flag knockdown and both poison procs ARE weapon-flag lines,
    // and isArenaSquelchLine drops every weapon-flag proc wholesale as noise — so
    // an enemy being stunned, the most tactically useful thing on the feed, was the
    // one thing Battle Focus reliably threw away.
    if (opts.announceAfflictions) {
      const affliction = classifyEnemyAffliction(line);
      // Buffs on your opponent are the same channel but the opposite news, and some
      // players want only one of the two. Separate toggle rather than a shared one.
      if (affliction && (affliction.kind === 'debuff' || opts.announceBuffs)) {
        const spoken = `${affliction.subject} is ${affliction.effect}.`;
        // Debounced per target+effect on a CLOCK, not on "was this the last thing
        // said". A stun re-echoes for as long as the target stays down, with ordinary
        // combat lines in between, so an adjacency check let every round through.
        const key = `${affliction.subject.toLowerCase()}::${affliction.effect}`;
        const now = Date.now();
        const spokenAt = afflictionSpokenAt.get(key);
        if (spokenAt !== undefined && now - spokenAt < AFFLICTION_REPEAT_MS) {
          if (debug) api.log(`${logPrefix}: squelched (affliction repeated within ${AFFLICTION_REPEAT_MS}ms): "${spoken}"`);
          return;
        }
        rememberAfflictionSpoken(key, now);
        lastSpokenArenaShape = spoken;
        if (debug) api.log(`${logPrefix}: affliction: "${line}" -> "${spoken}"`);
        queueLine(api, spoken);
        return;
      }
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
            announceAfflictions: api.getConfig().announceEnemyAfflictions !== false,
            announceBuffs: api.getConfig().announceEnemyBuffs !== false,
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

      speakArenaLineIfWorthy(api, full, debug, 'Arena (Bloodbath)', {
        dropChatLines: true,
        speakConditionLines: true,
        announceAfflictions: api.getConfig().announceEnemyAfflictions !== false,
            announceBuffs: api.getConfig().announceEnemyBuffs !== false,
      });
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
        longUtteranceKeepalive: true,
        alertSelfHealth: false,
        alertEnemyHealth: false,
        alertGameTick: false,
        alertTickIncludeTime: true,
        speakExploration: true,
        speakBattle: true,
        speakCommunication: true,
        speakIncidental: true,
        arenaObserverMode: false,
        announceEnemyAfflictions: true,
        announceEnemyBuffs: true,
        alertStunned: false,
        commandGateEnabled: true,
        commandGatePatterns: DEFAULT_COMMAND_GATE_PATTERNS,
        commandGateMs: DEFAULT_COMMAND_GATE_MS,
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
          key: 'speakExploration',
          type: 'boolean',
          label: 'Speak exploration lines',
          description:
            'Room names, room descriptions and room contents. Detected as a BLOCK: it opens on a line matching a room name the GMCP room feed or the prompt has reported (or on the "[Exits: ...]" line) and closes at the next prompt, because a room description is arbitrary prose with no marker of its own. A room whose name has not been reported yet can leak its title and description through for one render.',
        },
        {
          key: 'speakBattle',
          type: 'boolean',
          label: 'Speak battle lines',
          description:
            'Combat, run through the "game caster" pipeline rather than read blow by blow: it calls out afflictions landing on others, status effects, stuns/incapacitation, disarms, deaths and flees, and drops plain damage, avoidance, mundane movement, item-use lines, named-attack cast flavor and weapon-flag procs as noise (reusing Combat Compression\'s log-verified patterns). Condition/health-tier lines are dropped here too — "Announce self/enemy health changes" covers those on its own deduped GMCP feed. Also gates the self-debuff announcements that arrive over the char-affects GMCP feed.',
        },
        {
          key: 'speakCommunication',
          type: 'boolean',
          label: 'Speak communication lines',
          description:
            'Anything the chat classifier recognises as a channel — say, tell, gtell, whisper, yell, gossip/cgossip, OOC, clan/oclan, king/oking, ask-answer, radio, newbie, quest, bloodbath, auction, grats and community. Tested before every other category, so chat arriving in the middle of a room render stays chat.',
        },
        {
          key: 'speakIncidental',
          type: 'boolean',
          label: 'Speak incidental lines',
          description:
            'The catch-all: ambient room echoes ("The waves crash upon the shore while gulls scream overhead"), skill-improvement lines, random stat-fluctuation flavor, level-ups, quest text — and anything else that matches none of the three categories above. These mostly just appear while you stand still and share no structure worth matching, which is exactly why they get their own switch. Turning this OFF makes the reader an allowlist (only the categories you have enabled); leaving it ON means genuinely unusual one-off events still get spoken.',
        },
        {
          key: 'arenaObserverMode',
          type: 'boolean',
          label: 'Arena caster (overrides the switches above)',
          description:
            'EXCLUSIVE, not additive: while on, the four switches above do nothing. Arena is a room-gated pipeline that bypasses the squelch/prompt/category/include-exclude chain outright, so it cannot compose with switches that only exist inside that chain. Coliseum is spectator-only — ONLY lines broadcast from the five Coliseum rooms are spoken and there is no "you". Bloodbath is participant-driven — gated on your current room, with room renders and command noise dropped, and "Bloodbath System:" announcements (join window, elimination countdown, winner) always spoken regardless of room. Both drop plain damage, avoidance, movement/item-use, cast flavor, weapon-flag procs and chat, and speak what LANDS: afflictions, status effects, stuns/incapacitation, disarms, deaths and flees, about whichever fighter they happened to. Condition-tier lines are spoken once and again only on a real change.',
        },
        {
          key: 'announceEnemyAfflictions',
          type: 'boolean',
          label: 'Announce afflictions on others',
          description:
            'In any mode that speaks battle lines (Battle Focus and All), plus Arena modes, turns a third-person debuff or knockdown echo into a short callout — "Grumbly is stunned." instead of the raw "Grumbly is knocked to the ground by a rusty sword." Deliberately limited to conditions that CHANGE THE FIGHT: lost rounds (stun, bash, paralysis, toss), degraded offence (blind, slow, disarm, shield stripped), and degraded defence or sustain (faerie fire, poison, plague, drained healing). Per-round damage ticks are excluded even though they are recognised — poison and plague re-echo every round for the whole duration, and repeating the same news until the fight ends would bury everything else. Several of these were previously never spoken at all, because the Stunning weapon-flag knockdown and the poison procs are weapon-flag lines that Battle Focus drops wholesale as proc noise. Note it says WHO from the line itself and does not know your target — a groupmate being blinded is announced the same way an enemy is, because the game text does not distinguish them. Your own afflictions are not included here; those have their own toggle below.',
        },
        {
          key: 'announceEnemyBuffs',
          type: 'boolean',
          label: 'Announce buffs on others',
          description:
            'The same callout for helpful effects landing on someone else — "Grumbly is protected by sanctuary." Separate from afflictions above because it is the opposite news and some players only want one of the two. Limited to buffs that change the maths of a fight you are already in: sanctuary (halves your damage), stone skin, haste, a magic shield that will make your spells fail, and charm breaking (which changes who is fighting whom). Cosmetic and utility affects are not included. Same caveat as above — it reads WHO off the line and cannot tell your opponent from your groupmate, so a healer buffing the tank is announced too.',
        },
        {
          key: 'alertStunned',
          type: 'boolean',
          label: "Announce when you're stunned",
          description: 'Speaks "Alert: You are stunned!" on a confirmed self-stun (bash knockdown, trip) — the same lines the Stun Highlight plugin recolors in the terminal. Independent of Combat Mode above. Also, whenever Combat Mode is Battle Focus: the game\'s own char-affects GMCP tracking (game:affect-added/removed — the same feed the Affects panel uses) speaks a debuff the moment it lands ("You are afflicted by weaken.") and its wear-off, using the modifier\'s sign to tell debuff from buff (inverted for AC, where DSL/MERC convention makes a higher number worse) — buffs and zero-modifier effects (stuns, charms — this feed doesn\'t carry a sign for those) are left to the text-pattern coverage instead.',
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
          key: 'longUtteranceKeepalive',
          type: 'boolean',
          label: 'Long-utterance keepalive',
          description:
            'Chrome/Edge stop speaking after about 15 seconds. On, a silent pause/resume tick every 10s keeps a long utterance going, so a whole room description can be read as one flowing block instead of being chopped into ~200-character pieces with a gap between each. Off, utterances are capped at what fits in 15 seconds at the current speech rate. Turn it off if you hear a slight hitch every few seconds on your chosen voice.',
        },
        {
          key: 'commandGateEnabled',
          type: 'boolean',
          label: 'Silence after unspeakable commands',
          description: 'Briefly stops reading after you send a command whose output is layout rather than words — a map grid, a table, ASCII art. Unlike an exclude pattern, which drops output lines you can describe, this drops everything for a moment based on the command you typed, which is the only workable approach when the noise has no fixed text to match.',
        },
        {
          key: 'commandGatePatterns',
          type: 'textarea',
          label: 'Commands that silence speech',
          description: 'One command per line, matched against your whole input (case-insensitive) — not as a substring, so "map" silences map but never unmap or "say the map is wrong". Regex is allowed: "map \\d+" covers "map 3", and "map.*" would cover anything starting with map. A line that will not compile as a regex is matched literally. Blank lines and lines starting with # are ignored. Note this sees your input only when no user-script alias claimed it first — if you have an alias named map, add the command it expands to instead.',
          placeholder: 'map\nmap \\d+\nscore\nequipment',
          optional: true,
        },
        {
          key: 'commandGateMs',
          type: 'number',
          label: 'Silence duration (ms)',
          description: 'How long speech stays off after a matching command. Timed from when you press enter, so it has to cover the round trip to the server as well as the output itself — raise it if the tail end of a map still gets read. Sending another matching command restarts the window rather than stacking.',
          min: 0,
          max: 10000,
          step: 100,
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

    /**
     * Observes commands on their way out; never consumes one. The `undefined`
     * return is the contract for "not mine, keep going" — returning true here
     * would swallow `map` and the user would never see their map at all.
     *
     * This is the only hook that sees input, which brings one limitation worth
     * knowing: pluginHost only calls onAlias for commands NO user-script alias
     * matched, so a user who has aliased `map` gates nothing. Called out in the
     * field description rather than worked around, since intercepting ahead of
     * the alias pipeline would mean changing that pipeline for every plugin.
     */
    onAlias(api: PluginRuntimeApi, input: string): undefined {
      const cfg = api.getConfig();
      if (cfg.commandGateEnabled === false) return undefined;

      const patterns = String(cfg.commandGatePatterns ?? DEFAULT_COMMAND_GATE_PATTERNS);
      if (!matchesCommandGate(input, patterns)) return undefined;

      // Clamped at 0: a negative from a hand-edited config would set a deadline
      // in the past, which reads as "gate configured but silently never fires".
      const ms = Math.max(0, Number(cfg.commandGateMs ?? DEFAULT_COMMAND_GATE_MS));
      // max(), not assignment — a shorter gate arriving inside a longer one must
      // not cut the longer one short.
      commandGateUntil = Math.max(commandGateUntil, Date.now() + ms);

      // Anything mid-flight predates the command and is now stale: you have
      // moved on to a new command, so finishing the previous line's speech just
      // delays the silence you asked for. Matches what the pause bubble does.
      stopSpeaking();
      discardQueued();

      if (isDebug(api)) api.log(`command gate armed for ${ms}ms by: "${input.trim()}"`);
      return undefined;
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

      /** Pause and play are the same bubble; the icon says which one it currently is. */
      const syncPauseButton = () => {
        if (!pauseButton) return;
        const paused = isPaused();
        pauseButton.textContent = paused ? '▶️' : '⏸️';
        pauseButton.dataset.paused = paused ? '1' : '0';
        pauseButton.title = paused
          ? 'Speech is paused — click to resume (lines arriving while paused are discarded)'
          : 'Pause speech until you press play (anything said meanwhile is dropped, not queued)';
      };

      const onPauseClick = () => {
        setPaused(api, !isPaused());
        syncPauseButton();
      };

      const setPanelState = (button: HTMLButtonElement, on: boolean) => {
        button.dataset.on = on ? '1' : '0';
        const state = button.querySelector('.tts-panel-state');
        if (state) state.textContent = on ? 'ON' : 'OFF';
      };

      const syncModeButtons = () => {
        const toggles = resolveSpeechToggles(api.getConfig());
        for (const [category, button] of categoryButtons) setPanelState(button, toggles[category]);
        if (arenaButton) setPanelState(arenaButton, toggles.arena);

        if (modesButton) {
          // The collapsed button has to answer "why is it quiet?" without being
          // opened, so its tooltip is the summary the row of bubbles used to be.
          const on = toggles.arena
            ? ['Arena caster (overrides the rest)']
            : LINE_CATEGORIES.filter((c) => toggles[c]).map((c) => CATEGORY_LABELS[c]);
          modesButton.title = `Speaking: ${on.length ? on.join(', ') : 'nothing'} — click to change`;
        }
      };

      const setPanelOpen = (open: boolean) => {
        panelOpen = open;
        if (modesPanel) modesPanel.dataset.open = open ? '1' : '0';
        if (modesButton) {
          modesButton.dataset.open = open ? '1' : '0';
          modesButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open && modesPanel && controlsGroup) {
          // Opens rightward, but flips when the group has been dragged near the
          // right edge — otherwise the panel opens off-screen and looks like the
          // button did nothing.
          const groupRight = controlsGroup.getBoundingClientRect().right;
          const needed = modesPanel.offsetWidth || 215;
          modesPanel.dataset.side = groupRight + 10 + needed > window.innerWidth ? 'left' : 'right';
        }
      };

      /** Click anywhere outside the group closes the panel. */
      const onDocumentPointerDown = (e: PointerEvent) => {
        if (!panelOpen || !controlsGroup) return;
        if (e.target instanceof Node && controlsGroup.contains(e.target)) return;
        setPanelOpen(false);
      };

      const onModesButtonClick = () => setPanelOpen(!panelOpen);

      /**
       * Writes to the runtime AND the stored config. updateConfig alone is in-memory
       * only, and pluginHost.syncInstalled re-applies the saved userConfig over the
       * top on any installed-list change, so a bubble-only toggle would quietly
       * revert itself the next time an unrelated plugin was touched.
       */
      const applyTogglePatch = (patch: Record<string, unknown>) => {
        api.updateConfig(patch);
        persistPluginConfigPatch(PLUGIN_ID, patch);
        syncModeButtons();
      };

      const onCategoryClick = (category: LineCategory) => {
        const next = !resolveSpeechToggles(api.getConfig())[category];
        applyTogglePatch({ [CATEGORY_CONFIG_KEYS[category]]: next });
      };

      const onArenaClick = () => {
        const next = !resolveSpeechToggles(api.getConfig()).arena;
        // speechMode is cleared alongside it: a legacy `speechMode: 'arena'` also
        // reads as arena-on, so leaving it set would make turning arena OFF here
        // appear to do nothing.
        applyTogglePatch({ [ARENA_CONFIG_KEY]: next, speechMode: null });
      };

      const syncTargets = () => {
        const cfg = api.getConfig();

        // One draggable group holds every control. It is created unconditionally for
        // the same reason mute always existed: the toggles below choose which text
        // gets spoken, not whether speech can happen at all — health alerts, arena
        // mode and read-selection all speak with them off, so the controls that stop
        // and hold speech have to be reachable whenever the plugin is enabled.
        if (!controlsGroup) {
          controlsGroup = document.createElement('div');
          controlsGroup.id = CONTROLS_ID;
          document.body.appendChild(controlsGroup);
          // Inherits wherever the standalone mute button was last dropped, so an
          // existing placement survives the group replacing it.
          makeDraggable(controlsGroup, STOP_BUTTON_ID);
        }

        // Appended in this order; the group renders column-reverse, so mute sits at
        // the bottom on the original anchor and the rest stack upward from it.
        if (!stopButton) {
          stopButton = document.createElement('button');
          stopButton.type = 'button';
          stopButton.id = STOP_BUTTON_ID;
          stopButton.textContent = '🔇';
          stopButton.title = 'Stop speaking and clear the queue (drag the group to move)';
          controlsGroup.appendChild(stopButton);
        }
        stopButton.removeEventListener('click', onStopClick);
        stopButton.addEventListener('click', onStopClick);

        if (!pauseButton) {
          pauseButton = document.createElement('button');
          pauseButton.type = 'button';
          pauseButton.id = PAUSE_BUTTON_ID;
          controlsGroup.appendChild(pauseButton);
        }
        pauseButton.removeEventListener('click', onPauseClick);
        pauseButton.addEventListener('click', onPauseClick);
        syncPauseButton();

        if (!modesButton) {
          modesButton = document.createElement('button');
          modesButton.type = 'button';
          modesButton.id = MODES_BUTTON_ID;
          modesButton.textContent = '🎛️';
          modesButton.setAttribute('aria-haspopup', 'true');
          modesButton.addEventListener('click', onModesButtonClick);
          controlsGroup.appendChild(modesButton);

          modesPanel = document.createElement('div');
          modesPanel.id = MODES_PANEL_ID;

          const title = document.createElement('div');
          title.className = 'tts-panel-title';
          title.textContent = 'Speak';
          modesPanel.appendChild(title);

          // Labelled rows rather than the bare icons the row used to be: the panel
          // has the space for words, and an icon alone never said what it toggled.
          const makeRow = (icon: string, label: string, onClick: () => void) => {
            const button = document.createElement('button');
            button.type = 'button';
            const glyph = document.createElement('span');
            glyph.textContent = icon;
            const text = document.createElement('span');
            text.textContent = label;
            const state = document.createElement('span');
            state.className = 'tts-panel-state';
            button.append(glyph, text, state);
            button.addEventListener('click', onClick);
            modesPanel!.appendChild(button);
            return button;
          };

          for (const category of LINE_CATEGORIES) {
            categoryButtons.set(category, makeRow(CATEGORY_ICONS[category], CATEGORY_LABELS[category], () => onCategoryClick(category)));
          }

          arenaButton = makeRow('🏟️', 'Arena caster', onArenaClick);
          arenaButton.dataset.arena = '1';

          const note = document.createElement('div');
          note.className = 'tts-panel-note';
          note.textContent = 'Arena is exclusive — while on, the switches above do nothing.';
          modesPanel.appendChild(note);

          controlsGroup.appendChild(modesPanel);
          setPanelOpen(false);
          document.addEventListener('pointerdown', onDocumentPointerDown);
        }
        syncModeButtons();

        if (cfg.enablePageItems === true) {
          if (!readButton) {
            readButton = document.createElement('button');
            readButton.type = 'button';
            readButton.id = READ_BUTTON_ID;
            readButton.textContent = '🔊';
            readButton.title = 'Read selected/focused text aloud';
            controlsGroup.appendChild(readButton);
          }
          readButton.removeEventListener('click', onReadClick);
          readButton.addEventListener('click', onReadClick);
        } else if (readButton) {
          readButton.remove();
          readButton = null;
        }
      };

      // Capability probe at startup. Worth having when speech is broken — a missing
      // synthesizer or an empty voice list makes every later symptom identical to a
      // broken plugin, and the difference decides whether the fix is in this file at
      // all — but it says nothing useful on a working install, so it needs debug on.
      if (isDebug(api)) {
        const Synth = window.speechSynthesis;
        const voices = Synth ? Synth.getVoices().length : 0;
        api.log(
          `init: speechSynthesis=${Synth ? 'present' : 'MISSING'}, voices=${voices}` +
            (Synth && voices === 0 ? ' (voices load asynchronously; 0 here is normal at boot, but 0 at speak time means no audio)' : ''),
        );
      }

      /**
       * One-time migration off the old single-mode setting.
       *
       * `speechMode`/`combatMode` are NOT in configSchema.defaults, so finding a
       * string in either means this install genuinely has one saved — which is the
       * only way a plugin can tell a stored value from a default, since the runtime
       * config it sees is the two already merged. Both keys are nulled in the same
       * patch so this cannot run twice.
       */
      {
        const cfg = api.getConfig();
        const legacyMode = typeof cfg.speechMode === 'string' ? cfg.speechMode : cfg.combatMode;
        if (typeof legacyMode === 'string') {
          const derived: Record<string, unknown> = {};
          const toggles = togglesForLegacyMode(legacyMode);
          for (const category of LINE_CATEGORIES) derived[CATEGORY_CONFIG_KEYS[category]] = toggles[category];
          if (legacyMode === 'arena') derived[ARENA_CONFIG_KEY] = true;
          derived.speechMode = null;
          derived.combatMode = null;
          api.updateConfig(derived);
          persistPluginConfigPatch(PLUGIN_ID, derived);
          if (isDebug(api)) api.log(`migrated legacy "${legacyMode}" mode to the per-category switches`);
        }
      }

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

      /**
       * The room render's terminator, and the authoritative room-name source.
       *
       * A render is title, description, exits, then optional creatures and objects
       * — arbitrary prose with nothing in the TEXT marking where it begins, so the
       * decision has to come from here. But this event fires before every prompt,
       * not only after a render (see heldLinesAreRoomRender for the corpus numbers),
       * so its arrival confirms nothing on its own. The room NAME is the signal: a
       * render opens with a title that is exactly the name this event carries.
       *
       * Still feeds the name ring as well. The ring is no longer what makes room
       * detection work, but it keeps the second and later renders of a room
       * classifiable at arrival with no delay at all.
       */
      const offRoomData = api.onEvent('game:room-data', (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const name = String(p.room ?? p.name ?? '').trim();
        const renderStart = roomRenderStartIndex(roomCandidateLines, name);
        if (name) rememberRoomName(name);
        releaseRoomCandidate(api, renderStart);
        // Only on a confirmed render. Clearing it on every room_data would close
        // the block on prompts that interrupt nothing, and the prompt itself
        // already closes it on the ordinary path.
        if (renderStart >= 0) inRoomBlock = false;
      });

      // Battle Focus mode's self-debuff channel — see isAffectDebuff's
      // comment for why this only covers stat-modifying debuffs, not
      // stuns/charms/etc. Independent of the text-pattern Incapacitation/
      // Status coverage in speakArenaLineIfWorthy; this catches debuff
      // spells that never got their own text pattern written for them.
      const offAffectAdded = api.onEvent('game:affect-added', (payload) => {
        // Gated on the battle toggle, not on any one mode — this is the same battle
        // feature, just arriving over GMCP instead of as text.
        if (!resolveSpeechToggles(api.getConfig()).battle) return;

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
        // Gated on the battle toggle, not on any one mode — this is the same battle
        // feature, just arriving over GMCP instead of as text.
        if (!resolveSpeechToggles(api.getConfig()).battle) return;

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
        offRoomData();
        offTick();
        inRoomBlock = false;
        recentRoomNames.length = 0;
        lastSelfBucketKey = null;
        lastEnemyBucketKey = null;
        lastConditionBucketBySubject.clear();
        lastSpokenArenaShape = null;
        currentRoomName = '';
        inBloodbathRoomBlock = false;
        trackedSelfDebuffs.clear();
        clearRoomCandidate();
        userPaused = false;
        // A live deadline would otherwise outlast the disable and keep the next
        // enable silent for its remainder — brief, but exactly the kind of
        // "why is it broken" that has no visible cause.
        commandGateUntil = 0;
        if (readButton) {
          readButton.removeEventListener('click', onReadClick);
          readButton = null;
        }
        if (stopButton) {
          stopButton.removeEventListener('click', onStopClick);
          stopButton = null;
        }
        if (pauseButton) {
          pauseButton.removeEventListener('click', onPauseClick);
          pauseButton = null;
        }
        // The panel's rows carry closure-bound listeners and are removed with the
        // group below, so clearing the handles is all that is needed. The document
        // listener is NOT on the group, so it has to come off explicitly.
        document.removeEventListener('pointerdown', onDocumentPointerDown);
        categoryButtons.clear();
        if (modesButton) {
          modesButton.removeEventListener('click', onModesButtonClick);
          modesButton = null;
        }
        modesPanel = null;
        arenaButton = null;
        panelOpen = false;
        afflictionSpokenAt.clear();
        // Removing the group takes its children with it — they are no longer
        // free-floating elements on document.body.
        if (controlsGroup) {
          controlsGroup.remove();
          controlsGroup = null;
        }
      };
    },

    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      if (evt.name !== 'shatteredarchive:raw-data') return;

      const cfg = api.getConfig();
      if (cfg.enablePlayArea !== true) return;

      const toggles = resolveSpeechToggles(cfg);

      const payload = evt.payload as { rawText?: string; text?: string; fromUserScript?: boolean } | undefined;
      const rawText = String(payload?.rawText ?? payload?.text ?? '');
      if (!rawText) return;

      const fromUserScript = payload?.fromUserScript === true;
      const includePatterns = parsePatterns(cfg.includePatterns);
      const excludePatterns = parsePatterns(cfg.excludePatterns);
      const debug = cfg.debug === true;

      // Full sanitize, not just the SGR colors: a non-color sequence left in
      // place also breaks the pattern/squelch matching below (an anchored
      // exclude pattern stops matching a line that ends in ESC [ K).
      const plain = stripAnsiForSpeech(rawText).replace(/\r/g, '');

      // Arena is a mode now, but still an early return: its pipeline is deliberately
      // independent of the squelch/prompt/category/include-exclude chain below.
      if (toggles.arena) {
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

        // A prompt terminates a room-look render. Closed HERE, before the skip
        // below, because the prompt is normally excluded from speech — leaving the
        // close inside that branch would mean the block never ends for anyone who
        // turned prompt exclusion off, and would never end at all otherwise.
        if (looksLikePromptLine(line)) {
          inRoomBlock = false;
          const promptRoom = line.match(PROMPT_ROOM_NAME_RE)?.[1]?.trim();
          if (promptRoom) rememberRoomName(promptRoom);
          if (cfg.excludePromptLines === true) {
            if (debug) api.log(`Skipped (prompt line): "${line}"`);
            continue;
          }
        }

        // Room-look render tracking. The title is matched against room names the
        // GMCP room feed and the prompt have actually reported, because a room
        // description is arbitrary prose with no marker distinguishing it from any
        // other text — the ONLY thing identifying the block is that it opens with a
        // name we already know. The exits line opens it too, as a fallback for a
        // title that arrived before its room-data event did.
        //
        // Tracked HERE, above the include/exclude filters, because this is structure
        // rather than speech policy: an exclude pattern that happens to match a room
        // title would otherwise stop the block from ever opening and let the whole
        // description through as unclassified text.
        if (isKnownRoomName(line) || EXITS_LINE_RE.test(line)) inRoomBlock = true;

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

        const category = classifySpeechCategory(line, inRoomBlock);

        // 'incidental' is the bucket that means "no rule recognised this", and an
        // unrecognised room title or description lands there — which is why rooms
        // leaked. The title arrives BEFORE the room-data event that names it, so on
        // a room's first visit the name ring is empty and nothing identifies it; the
        // exits line opens the block, but by then the title and the whole
        // description have already been classified and spoken. Every new room read
        // itself out regardless of the exploration switch.
        //
        // So an incidental line is not decided yet — it is held for a moment to see
        // whether room-data arrives behind it. Nothing else is delayed.
        if (category === 'incidental') {
          holdRoomCandidate(api, line);
          continue;
        }
        if (!toggles[category]) {
          if (debug) api.log(`Skipped (${category} lines are switched off): "${line}"`);
          continue;
        }

        // Battle lines go through the same classify-and-speak pipeline as Arena
        // Observer Mode (squelch Damage/Avoidance/Ambient/Item Use/Attack Flavor/
        // UI Noise/weapon-flag procs, announce afflictions, speak Status/
        // Incapacitation/Disarm/Death/Flee immediately, dedupe repeats) rather than
        // being read raw. That holds in 'all' too: Battle Focus IS the battle
        // feature, and "all features on" means it runs, not that damage spam comes
        // back. Condition-tier lines are dropped here (speakConditionLines: false)
        // since "Announce self/enemy health changes" covers those on its own deduped
        // GMCP path; chat never reaches this branch, being its own category now.
        if (category === 'battle') {
          speakArenaLineIfWorthy(api, line, debug, 'Battle', {
            dropChatLines: false,
            speakConditionLines: false,
            announceAfflictions: cfg.announceEnemyAfflictions !== false,
            announceBuffs: cfg.announceEnemyBuffs !== false,
          });
          continue;
        }

        if (debug) api.log(`Buffering (${category}): "${line}"`);
        queueLine(api, line);
      }
    },
  };
}
