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
  enabledPanes: Record<ChatSubtype, boolean>;
}

const STORAGE_KEY = 'shatteredArchive.chatSettings.v1';

const DEFAULT_SETTINGS: ChatSettings = {
  strictChatFormat: false,
  enableChatPanes: false,
  enabledPanes: KNOWN_CHAT_SUBTYPES.reduce(
    (acc, k) => {
      acc[k] = true;
      return acc;
    },
    {} as Record<ChatSubtype, boolean>,
  ),
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

function normalizeSettings(raw: any): ChatSettings {
  const base: ChatSettings = { ...DEFAULT_SETTINGS };

  if (raw && typeof raw === 'object') {
    if (typeof raw.strictChatFormat === 'boolean') base.strictChatFormat = raw.strictChatFormat;
    if (typeof raw.enableChatPanes === 'boolean') base.enableChatPanes = raw.enableChatPanes;

    if (raw.enabledPanes && typeof raw.enabledPanes === 'object') {
      for (const k of KNOWN_CHAT_SUBTYPES) {
        if (typeof raw.enabledPanes[k] === 'boolean') {
          base.enabledPanes[k] = raw.enabledPanes[k];
        }
      }
    }
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
  setChatSettings({
    ...cur,
    ...patch,
    enabledPanes: patch.enabledPanes ? { ...cur.enabledPanes, ...patch.enabledPanes } : cur.enabledPanes,
  });
}

export function subscribeChatSettings(fn: (s: ChatSettings) => void): () => void {
  subscribers.add(fn);
  fn(getChatSettings());

  return () => {
    subscribers.delete(fn);
  };
}