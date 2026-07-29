/**
 * Every localStorage touch in the app goes through here.
 *
 * Two reasons: the key names stay in one place (they are a de-facto data format — a rename
 * silently signs everyone out of their rooms), and access is wrapped, because localStorage
 * throws rather than returning null in a Safari private window or with site data blocked.
 * A user with storage disabled should lose reconnect convenience, not the whole app.
 */

const NAME_KEY = 'scrum-poker:name';
const THEME_KEY = 'scrum-poker:theme';
const secretKey = (roomId: string) => `scrum-poker:participant-secret:${roomId}`;
const hostKey = (roomId: string) => `scrum-poker:host:${roomId}`;
/** Pre-split-identity key; it held a PUBLIC participant id, which is no longer a credential. */
const legacyParticipantKey = (roomId: string) => `scrum-poker:participant:${roomId}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — reconnect convenience is lost, nothing else */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

export const storage = {
  /** The display name, remembered across rooms so a regular never retypes it. */
  getName: () => read(NAME_KEY) ?? '',
  setName: (name: string) => write(NAME_KEY, name),

  /**
   * Per-room participant secret: replaying it on join re-attaches to the same row, keeping
   * your vote through a refresh. This is a credential — anyone holding it can vote as you and
   * see your estimate before the reveal — which is why it is the server-minted secret and not
   * the participant id the roster shows to the whole room.
   */
  getParticipantSecret: (roomId: string) => read(secretKey(roomId)),
  setParticipantSecret: (roomId: string, secret: string) => {
    write(secretKey(roomId), secret);
    // Tidy away the id this used to store, so it doesn't sit in browsers looking meaningful.
    remove(legacyParticipantKey(roomId));
  },

  /** Per-room host token, handed out once at creation. Its presence is what makes you the organizer. */
  getHostToken: (roomId: string) => read(hostKey(roomId)) ?? undefined,
  setHostToken: (roomId: string, token: string) => write(hostKey(roomId), token),

  getTheme: () => read(THEME_KEY),
  setTheme: (theme: string) => write(THEME_KEY, theme),
};

export const THEME_STORAGE_KEY = THEME_KEY;
