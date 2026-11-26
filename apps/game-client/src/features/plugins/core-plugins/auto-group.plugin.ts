// apps/game-client/src/features/plugins/core-plugins/auto-group.plugin.ts
//
// Groups a player the moment they start following you ("Ezrianne now follows you." -> `group Ezrianne`),
// subject to allow/exclude lists for names and for affiliations (clan or kingdom).
//
// Whether to group is decided from the game's own state, not from a timer. A follower who stops
// and re-follows has left the group, and `group <name>` on someone already in it takes them OUT, so
// before each `group` this plugin sends `gr` and reads who is actually listed. Only when the `gr`
// reply cannot be read does it group anyway (a re-follow normally means they are out).
//
// An affiliation is looked up with `whois <name>` only when an affiliation list could change the
// outcome and nothing fresh is remembered. The answer goes into the shared People database
// (peopleDb.ts) stamped with affiliationCheckedAt, so a player is looked up once per max-age period,
// and the People and Highlighter plugins see the same data.
//
// The plugin sends its own whois and gr through api.sendCommand, which does NOT pass through
// onAlias, so the People plugin's passive scan is not armed by it: this plugin reads the replies
// itself. Parsing and the allow/exclude decision are in auto-group-logic.ts and who-line.ts.

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { getPerson, setPerson } from './peopleDb';
import {
  cleanLines,
  decide,
  isGroupHeader,
  isWhoisNotFound,
  lookupAffiliation,
  parseFollowLine,
  parseGroupRow,
  parseJoinedLine,
  parseStopLine,
  readRules,
  type Decision,
} from './auto-group-logic';
import { parseWhoLine, whoLineMentionsName, type WhoLine } from './who-line';

const RAW_DATA = 'shatteredarchive:raw-data';

/** Give up waiting for a whois reply after this long; the remembered value (or the default) is used. */
const WHOIS_TIMEOUT_MS = 4_000;
/** Never send a second whois for the same player inside this window (a flapping follower). */
const WHOIS_COOLDOWN_MS = 30_000;
/** Give up waiting for the `gr` reply after this long and group anyway. */
const GR_TIMEOUT_MS = 3_000;
/**
 * After sending `group <name>`, ignore another follow line for that name until the game confirms
 * ("joins your group") or the player stops following, or this long passes. It only bridges the gap
 * before the server answers, so a doubled follow line cannot send `group` twice and toggle them out.
 */
const GROUP_CONFIRM_MS = 5_000;
/** The People plugin does not store immortals; neither does this one. */
const IMMORTAL_LEVEL = 52;
const DEFAULT_MAX_AGE_DAYS = 30;

interface PendingWhois {
  name: string;
  /** The remembered (possibly stale) affiliation to fall back on if the whois gets no usable reply. */
  fallback: string | null;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingGroupCheck {
  key: string;
  name: string;
  /** Why the rules said yes, for the terminal line. */
  reason: string;
  timer: ReturnType<typeof setTimeout>;
}

function maxAgeDays(cfg: Record<string, unknown>): number {
  const n = Number(cfg.affiliationMaxAgeDays);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_AGE_DAYS;
}

export function createAutoGroupPlugin(): IPluginModule {
  function onEnable(api: PluginRuntimeApi): () => void {
    /** When we sent `group <name>` and have not yet heard the game confirm it. */
    const groupSentAt = new Map<string, number>();
    const lastWhois = new Map<string, number>();
    const pendingWhois = new Map<string, PendingWhois>();
    /** `gr` commands in flight, oldest first: replies come back in the order they were sent. */
    const pendingChecks: PendingGroupCheck[] = [];
    /** Names read so far from the `gr` reply being received, or null when none is open. */
    let grMembers: Set<string> | null = null;

    const announce = (text: string) => {
      if (api.getConfig().announce !== false) api.writeTerminal(`{D[auto-group]{x ${text}\n`);
    };

    // ── group, after checking `gr` ───────────────────────────────────────

    const settleCheck = (check: PendingGroupCheck, members: Set<string> | null) => {
      clearTimeout(check.timer);
      pendingChecks.splice(pendingChecks.indexOf(check), 1);

      if (members?.has(check.key)) {
        announce(`{W${check.name}{x is already in your group.`);
        return;
      }
      groupSentAt.set(check.key, Date.now());
      api.sendCommand(`group ${check.name}`);
      announce(
        `{W${check.name}{x grouped: ${check.reason}${members ? '' : ' (could not read your group list first)'}.`,
      );
    };

    const groupAfterCheck = (name: string, reason: string) => {
      const check: PendingGroupCheck = {
        key: name.toLowerCase(),
        name,
        reason,
        timer: setTimeout(() => {
          grMembers = null;
          settleCheck(check, null);
        }, GR_TIMEOUT_MS),
      };
      pendingChecks.push(check);
      api.sendCommand('gr');
    };

    const apply = (name: string, decision: Decision) => {
      if (decision.action === 'group') {
        groupAfterCheck(name, decision.reason);
      } else {
        announce(`{W${name}{x not grouped: ${decision.reason}.`);
      }
    };

    // ── whois ────────────────────────────────────────────────────────────

    const remember = (name: string, result: WhoLine) => {
      setPerson(name, {
        name: getPerson(name)?.name ?? name,
        level: result.level,
        race: result.race,
        class: result.class,
        org: result.org,
        orgType: result.orgType,
        affiliationCheckedAt: Date.now(),
      });
    };

    const settleWhois = (key: string, p: PendingWhois, result: WhoLine | null) => {
      clearTimeout(p.timer);
      pendingWhois.delete(key);

      let affiliation: string | null = p.fallback;
      if (result) {
        affiliation = result.org;
        if (result.level < IMMORTAL_LEVEL) remember(p.name, result);
      }
      // Rules are read again here: the user may have edited them while the whois was in flight.
      apply(p.name, decide(p.name, readRules(api.getConfig()), affiliation));
    };

    // ── a follow line ────────────────────────────────────────────────────

    const handleFollow = (name: string) => {
      const key = name.toLowerCase();
      const now = Date.now();

      const sentAt = groupSentAt.get(key);
      if (sentAt !== undefined && now - sentAt < GROUP_CONFIRM_MS) return;
      if (pendingWhois.has(key) || pendingChecks.some((c) => c.key === key)) return;

      const cfg = api.getConfig();
      const rules = readRules(cfg);
      const memory = lookupAffiliation(getPerson(name), now, maxAgeDays(cfg));

      const first = decide(name, rules, memory.fresh ? memory.known : undefined);
      if (first.action !== 'need-affiliation') {
        apply(name, first);
        return;
      }

      const fallback = memory.known ?? null;
      const last = lastWhois.get(key);
      if (last !== undefined && now - last < WHOIS_COOLDOWN_MS) {
        apply(name, decide(name, rules, fallback));
        return;
      }

      lastWhois.set(key, now);
      const entry: PendingWhois = {
        name,
        fallback,
        timer: setTimeout(() => settleWhois(key, entry, null), WHOIS_TIMEOUT_MS),
      };
      pendingWhois.set(key, entry);
      api.sendCommand(`whois ${name}`);
    };

    // ── the game's output ────────────────────────────────────────────────

    const off = api.onEvent(RAW_DATA, (payload: unknown) => {
      const p = payload as { rawText?: unknown; text?: unknown } | null;
      const chunk = String(p?.rawText ?? p?.text ?? '');
      if (!chunk) return;

      for (const line of cleanLines(chunk)) {
        // Inside a `gr` reply: collect rows until the first line that is not one.
        if (grMembers) {
          const member = parseGroupRow(line);
          if (member !== null) {
            grMembers.add(member);
            continue;
          }
          const done = grMembers;
          grMembers = null;
          settleCheck(pendingChecks[0], done);
        }

        // Only our own `gr` matters: a `gr` the user typed with nothing pending is left alone.
        if (pendingChecks.length > 0 && isGroupHeader(line)) {
          grMembers = new Set();
          continue;
        }

        const follower = parseFollowLine(line);
        if (follower) {
          handleFollow(follower);
          continue;
        }

        const joined = parseJoinedLine(line);
        if (joined) {
          groupSentAt.delete(joined.toLowerCase());
          continue;
        }

        const stopped = parseStopLine(line);
        if (stopped) {
          groupSentAt.delete(stopped.toLowerCase());
          continue;
        }

        if (pendingWhois.size === 0) continue;

        if (isWhoisNotFound(line)) {
          // Replies come back in the order the whois commands went out: the oldest one is the miss.
          for (const [key, oldest] of pendingWhois) {
            settleWhois(key, oldest, null);
            break;
          }
          continue;
        }

        const whois = parseWhoLine(line);
        if (!whois) continue;
        for (const [key, entry] of pendingWhois) {
          if (whoLineMentionsName(whois.rest, entry.name)) {
            settleWhois(key, entry, whois);
            break;
          }
        }
      }
    });

    return () => {
      off();
      for (const entry of pendingWhois.values()) clearTimeout(entry.timer);
      for (const check of pendingChecks) clearTimeout(check.timer);
      pendingWhois.clear();
      pendingChecks.length = 0;
      grMembers = null;
      groupSentAt.clear();
      lastWhois.clear();
    };
  }

  return {
    manifest: {
      id: 'auto-group',
      name: 'Auto Group',
      version: '0.1.0',
      description:
        'Groups a player when they start following you, after checking `gr` that they are not already in your group. Does nothing until you add an allowed user or affiliation, or set "Everyone else" to group them. Excluded users and affiliations are never grouped. Affiliations are looked up with whois once and remembered in the People database.',
    },

    configSchema: {
      defaults: {
        allowedUsers: '',
        excludedUsers: '',
        allowedAffiliations: '',
        excludedAffiliations: '',
        defaultAction: 'ignore',
        affiliationMaxAgeDays: DEFAULT_MAX_AGE_DAYS,
        announce: true,
      },
      fields: [
        {
          key: 'allowedUsers',
          type: 'textarea',
          label: 'Allowed users',
          description:
            'Always grouped when they follow you, with no whois. One name per line or comma separated; a line starting with # is a comment.',
        },
        {
          key: 'excludedUsers',
          type: 'textarea',
          label: 'Excluded users',
          description: 'Never grouped. Wins over everything else, including Allowed users.',
        },
        {
          key: 'allowedAffiliations',
          type: 'textarea',
          label: 'Allowed affiliations',
          description:
            'Clans or kingdoms to group, e.g. Shadow or NT (New Thalos and NT count as the same). "none" matches players with no clan or kingdom. Setting this, or Excluded affiliations, makes the plugin send a whois to look a follower up, once per player.',
        },
        {
          key: 'excludedAffiliations',
          type: 'textarea',
          label: 'Excluded affiliations',
          description: 'Clans or kingdoms never to group. Checked before Allowed affiliations.',
        },
        {
          key: 'defaultAction',
          type: 'select',
          label: 'Everyone else',
          description:
            'What to do with a follower no rule matched, or whose affiliation could not be looked up (no reply, or no one by that name).',
          options: [
            { label: 'Do not group', value: 'ignore' },
            { label: 'Group them', value: 'group' },
          ],
        },
        {
          key: 'affiliationMaxAgeDays',
          type: 'number',
          label: 'Trust a remembered affiliation for (days)',
          description:
            'How long a clan or kingdom remembered in the People database is used before the player is looked up again with whois. 0 = never look up again.',
          min: 0,
          max: 3650,
          step: 1,
        },
        {
          key: 'announce',
          type: 'boolean',
          label: 'Say what it did',
          description: 'Print a short line in the terminal for each follower: grouped or not, and why.',
        },
      ],
    },

    onEnable,
  };
}
