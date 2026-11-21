// apps/game-client/src/features/chat/chat-settings-store.ts

export type ChatSubtype =
  | 'say'
  | 'gtell'
  | 'tell'
  | 'yell'
  | 'gossip'
  | 'cgossip'
  | 'oking'
  | 'king'
  | 'oclan'
  | 'clan'
  | 'ooc'
  | 'askanswer'
  | 'whisper'
  | 'pray'
  | 'radio'
  | 'newbie'
  | 'quest'
  | 'bb'
  | 'auction'
  | 'grats'
  | 'community';

export const KNOWN_CHAT_SUBTYPES: ChatSubtype[] = [
  'say',
  'gtell',
  'tell',
  'yell',
  'gossip',
  'cgossip',
  'oking',
  'king',
  'oclan',
  'clan',
  'ooc',
  'askanswer',
  'whisper',
  'pray',
  'radio',
  'newbie',
  'quest',
  'bb',
  'auction',
  'grats',
  'community',
];

export interface ChatSettings {
  strictChatFormat: boolean;
  enableChatPanes: boolean;

  // NEW: show panes even if they have no messages
  showHiddenChatPanes: boolean;

  // A dot on a pane tab that has unread messages. Only works with strictChatFormat and enableChatPanes on.
  // Stored only when on (see toStored), so it follows a future default for anyone who never turned it on.
  unreadDots: boolean;

  // Which panes are enabled (regardless of whether they have messages yet)
  enabledPanes: Record<ChatSubtype, boolean>;

  // Display order for pills (subtypes only; "All" is always first)
  paneOrder: ChatSubtype[];
}

const STORAGE_KEY = 'shatteredArchive.chatSettings.v1';

const DEFAULT_SETTINGS: ChatSettings = {
  strictChatFormat: false,
  enableChatPanes: false,
  showHiddenChatPanes: false,
  unreadDots: false,
  enabledPanes: KNOWN_CHAT_SUBTYPES.reduce(
    (acc, k) => {
      acc[k] = true;
      return acc;
    },
    {} as Record<ChatSubtype, boolean>,
  ),
  paneOrder: [...KNOWN_CHAT_SUBTYPES],
};

let settingsCache: ChatSettings | null = null;
const subscribers = new Set<(s: ChatSettings) => void>();

function safeParse(json: string | null): any | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isSubtype(v: any): v is ChatSubtype {
  return typeof v === 'string' && (KNOWN_CHAT_SUBTYPES as string[]).includes(v);
}

function normalizeOrder(rawOrder: any): ChatSubtype[] {
  const out: ChatSubtype[] = [];
  const seen = new Set<string>();

  if (Array.isArray(rawOrder)) {
    for (const v of rawOrder) {
      if (!isSubtype(v)) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }

  for (const k of KNOWN_CHAT_SUBTYPES) {
    if (!seen.has(k)) out.push(k);
  }

  return out;
}

function normalizeSettings(raw: any): ChatSettings {
  // enabledPanes is copied: a shallow spread would hand out the shared defaults object, the stored flags below would
  // overwrite it in place, and ChatPane (which memoises on this object's identity) would never see a change.
  const base: ChatSettings = { ...DEFAULT_SETTINGS, enabledPanes: { ...DEFAULT_SETTINGS.enabledPanes } };

  if (raw && typeof raw === 'object') {
    if (typeof raw.strictChatFormat === 'boolean') base.strictChatFormat = raw.strictChatFormat;
    if (typeof raw.enableChatPanes === 'boolean') base.enableChatPanes = raw.enableChatPanes;
    if (typeof raw.showHiddenChatPanes === 'boolean') base.showHiddenChatPanes = raw.showHiddenChatPanes;
    if (typeof raw.unreadDots === 'boolean') base.unreadDots = raw.unreadDots;

    if (raw.enabledPanes && typeof raw.enabledPanes === 'object') {
      for (const k of KNOWN_CHAT_SUBTYPES) {
        if (typeof raw.enabledPanes[k] === 'boolean') {
          base.enabledPanes[k] = raw.enabledPanes[k];
        }
      }
    }

    base.paneOrder = normalizeOrder(raw.paneOrder);
  }

  return base;
}

export function getChatSettings(): ChatSettings {
  if (settingsCache) return settingsCache;

  const raw = safeParse(localStorage.getItem(STORAGE_KEY));
  settingsCache = normalizeSettings(raw);
  return settingsCache;
}

// What goes into storage: the settings as they are, except `unreadDots`, which is written only when it is on.
// A value the user never turned on stays absent and reads as the current default (SETTINGS-01).
function toStored(settings: ChatSettings): Record<string, unknown> {
  const { unreadDots, ...rest } = settings;
  return unreadDots ? { ...rest, unreadDots: true } : { ...rest };
}

export function setChatSettings(next: ChatSettings) {
  settingsCache = normalizeSettings(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(settingsCache)));
  } catch {
    // Storage full or blocked: keep the in-memory settings and carry on (typescript.md: storage fails safe).
    console.warn('chat settings could not be saved');
  }
  subscribers.forEach((fn) => fn(settingsCache!));
}

export function updateChatSettings(patch: Partial<ChatSettings>) {
  const cur = getChatSettings();

  const merged: ChatSettings = {
    ...cur,
    ...patch,
    enabledPanes: patch.enabledPanes ? { ...cur.enabledPanes, ...patch.enabledPanes } : cur.enabledPanes,
    paneOrder: patch.paneOrder ? normalizeOrder(patch.paneOrder) : cur.paneOrder,
  };

  setChatSettings(merged);
}

export function subscribeChatSettings(fn: (s: ChatSettings) => void): () => void {
  subscribers.add(fn);
  fn(getChatSettings());

  return () => {
    subscribers.delete(fn);
  };
}
