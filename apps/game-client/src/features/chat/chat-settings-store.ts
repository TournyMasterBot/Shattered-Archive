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
  const base: ChatSettings = { ...DEFAULT_SETTINGS };

  if (raw && typeof raw === 'object') {
    if (typeof raw.strictChatFormat === 'boolean') base.strictChatFormat = raw.strictChatFormat;
    if (typeof raw.enableChatPanes === 'boolean') base.enableChatPanes = raw.enableChatPanes;
    if (typeof raw.showHiddenChatPanes === 'boolean') base.showHiddenChatPanes = raw.showHiddenChatPanes;

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

export function setChatSettings(next: ChatSettings) {
  settingsCache = normalizeSettings(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsCache));
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
