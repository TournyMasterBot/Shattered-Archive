import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  CodenameExhaustedError,
  JsonlStore,
  formatCodename,
  normalizeName,
  pickNewestWhoisic,
  resolveCharacter,
  scrub,
  setGender,
  type Gender,
  type LedgerFs,
  type ScrubEntry,
  type Suggestion,
  type TestMatrix,
  type Validated,
  type WhoisicRecord,
} from '@shatteredarchive/copilot-core';
import { namesStoreOver, type NameDirectory } from './namesStore.js';
import {
  characterId,
  validateDescription,
  validateIndexRecord,
  validateNameEntry,
  type CharacterIndexRecord,
  type CharacterKindName,
  type NameEntry,
  type StoredDescription,
} from './records.js';

/** A character name as the game accepts it. Anything else in `login_data` is not registered (no storing of arbitrary text). */
export const NAME_SHAPE = /^[A-Za-z][A-Za-z'-]{1,29}$/;
const CODENAME_PARAM = /^([A-Za-z][A-Za-z0-9]{0,23})-([MFU])$/;
const FILE_MAX_BYTES = 20 * 1024 * 1024;

/** What the API says about a character: never a name. */
export interface CharacterSummary {
  /** `Base-G`, for example `Agate-F` or `Orion-U`. */
  codename: string;
  kind: CharacterKindName;
  gender: Gender;
  hasDescription: boolean;
}

export interface DescriptionView {
  codename: string;
  kind: CharacterKindName;
  gender: Gender;
  at: number;
  fields: Record<string, string>;
  hasDescription: boolean;
  rawAnsi: string;
  dsl: string;
  text: string;
  unmapped: string[];
}

export type LoginOutcome =
  | { ok: true; codename: string; kind: CharacterKindName; gender: Gender; isNew: boolean }
  | { ok: false; reason: 'unavailable' | 'bad-name' | 'codenames-exhausted' | 'store-failed' };

export type WhoisicOutcome = 'stored' | 'unchanged' | 'older' | 'unregistered' | 'failed';

export interface CharacterCounters {
  logins: number;
  newRealCharacters: number;
  /** Logins not registered: no matrix, a name that is not name-shaped, a full codename list or a failing store. */
  refusedLogins: number;
  descriptionsStored: number;
  /** Blocks for names that are not registered, older than the stored one, or identical to it. */
  descriptionsIgnored: number;
  storeFailures: number;
}

export interface CharacterServiceOptions {
  fs: LedgerFs;
  /** `<data>/characters`. */
  dir: string;
  /** The private test matrix. Undefined means it could not be read: nothing is registered then (fail closed, so a test character is never given a real codename). */
  matrix: TestMatrix | undefined;
  now: () => number;
}

interface Active {
  id: string;
  codename: string;
  kind: CharacterKindName;
  gender: Gender;
  /** The real name of the character being played. In memory only; used to build the `whoisic` command. */
  name: string;
}

const nameHash = (key: string): string => createHash('sha256').update(key).digest('hex').slice(0, 16);

/**
 * The character registry: who is being played (login), under which codename, and the newest `whoisic` description of each
 * character. Calls are serialised (copilot-core's registry assumes one writer). A real name goes in at `onLogin` or `onWhoisic`, is
 * resolved to a codename, and from then on exists only in `names.jsonl` and, for the active character, in memory.
 */
export class CharacterService {
  readonly counters: CharacterCounters = {
    logins: 0,
    newRealCharacters: 0,
    refusedLogins: 0,
    descriptionsStored: 0,
    descriptionsIgnored: 0,
    storeFailures: 0,
  };
  private tail: Promise<unknown> = Promise.resolve();
  private active: Active | undefined;

  private constructor(
    private readonly options: CharacterServiceOptions,
    private readonly names: NameDirectory,
    private readonly index: JsonlStore<CharacterIndexRecord>,
    private readonly descriptions: JsonlStore<StoredDescription>,
  ) {}

  /** Open the three stores and repair the index from the name registry (a crash between the two writes of a login). */
  static async open(options: CharacterServiceOptions): Promise<{ service: CharacterService; skipped: number }> {
    const { fs, dir } = options;
    const open = <T extends { id: string }>(file: string, validate: (v: unknown) => Validated<T>) =>
      JsonlStore.open<T>({ fs, path: path.join(dir, file), validate, maxBytes: FILE_MAX_BYTES });
    const [names, index, descriptions] = await Promise.all([
      open<NameEntry>('names.jsonl', validateNameEntry),
      open<CharacterIndexRecord>('index.jsonl', validateIndexRecord),
      open<StoredDescription>('descriptions.jsonl', validateDescription),
    ]);
    const service = new CharacterService(options, namesStoreOver(names.store), index.store, descriptions.store);
    await service.repairIndex();
    return { service, skipped: names.store.skipped + index.store.skipped + descriptions.store.skipped };
  }

  private async repairIndex(): Promise<void> {
    for (const { key, record } of this.names.names()) {
      const id = characterId('real', record.codename, record.gender);
      const known = this.index.get(id);
      if (known === undefined || known.gender !== record.gender) {
        await this.index.append({
          id,
          codename: record.codename,
          kind: 'real',
          gender: record.gender,
          nameHash: nameHash(key),
          firstSeen: known?.firstSeen ?? record.firstSeen,
          lastSeen: Math.max(known?.lastSeen ?? 0, record.lastSeen),
        });
      }
    }
  }

  private enqueue<R>(task: () => Promise<R>): Promise<R> {
    const next = this.tail.then(task, task);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** The codename of the character being played, if a login was seen in this session. */
  get current(): { codename: string; kind: CharacterKindName; gender: Gender } | undefined {
    return this.active === undefined ? undefined : { codename: this.active.codename, kind: this.active.kind, gender: this.active.gender };
  }

  // ---- login ------------------------------------------------------------------------------------------------------------

  /** A `login_data` record: register the character (or recognise it) and make it the active one. `name` is a REAL name. */
  onLogin(name: string): Promise<LoginOutcome> {
    return this.enqueue(async () => {
      this.counters.logins++;
      const { matrix, now } = this.options;
      const refuse = (reason: Extract<LoginOutcome, { ok: false }>['reason']): LoginOutcome => {
        this.counters.refusedLogins++;
        if (reason === 'store-failed') this.counters.storeFailures++;
        return { ok: false, reason };
      };
      if (matrix === undefined) return refuse('unavailable');
      const trimmed = name.trim();
      if (!NAME_SHAPE.test(trimmed)) return refuse('bad-name');

      let resolved;
      try {
        resolved = await resolveCharacter(trimmed, matrix, this.names, now());
      } catch (error) {
        return refuse(error instanceof CodenameExhaustedError ? 'codenames-exhausted' : 'store-failed');
      }
      if (resolved.isNew) this.counters.newRealCharacters++;

      const id = characterId(resolved.kind, resolved.codename, resolved.gender);
      const prior = this.index.get(id);
      const saved = await this.index.append({
        id,
        codename: resolved.codename,
        kind: resolved.kind,
        gender: resolved.gender,
        nameHash: nameHash(normalizeName(trimmed)),
        firstSeen: prior?.firstSeen ?? now(),
        lastSeen: now(),
      });
      // The name registry is the record of truth; a failed index write is repaired at the next start or login.
      if (!saved.ok) this.counters.storeFailures++;

      this.active = { id, codename: resolved.codename, kind: resolved.kind, gender: resolved.gender, name: trimmed };
      return { ok: true, codename: resolved.codename, kind: resolved.kind, gender: resolved.gender, isNew: resolved.isNew };
    });
  }

  /** The connection closed: nobody is being played until the next login. */
  onSessionClosed(): void {
    this.active = undefined;
  }

  // ---- descriptions -----------------------------------------------------------------------------------------------------

  /** A parsed `whoisic` block. Stored only for a registered or test character; the newest block wins. `record.name` is a REAL name. */
  onWhoisic(record: WhoisicRecord): Promise<WhoisicOutcome> {
    return this.enqueue(async () => {
      const { matrix, now } = this.options;
      const key = normalizeName(record.name);
      let who: { kind: CharacterKindName; codename: string; gender: Gender } | undefined;
      const test = matrix?.lookup(key);
      if (test !== undefined) {
        who = { kind: 'test', codename: test.codename, gender: test.gender };
      } else {
        const real = await this.names.get(key);
        if (real !== undefined) who = { kind: 'real', codename: real.codename, gender: real.gender };
      }
      if (who === undefined) {
        this.counters.descriptionsIgnored++;
        return 'unregistered';
      }
      const { kind, codename, gender } = who;

      const id = characterId(kind, codename, gender);
      const existing = this.descriptions.get(id);
      if (existing !== undefined && pickNewestWhoisic(this.asRecord(existing), record) !== record) {
        this.counters.descriptionsIgnored++;
        return 'older';
      }

      const outcome = await this.storeDescription(record, id, kind, codename, existing);
      if (outcome === 'failed') return outcome;
      if (kind === 'real') await this.learnGender(key, record, id);
      return outcome;
    });
  }

  private asRecord(stored: StoredDescription): WhoisicRecord {
    return { name: '', fields: stored.fields, hasDescription: stored.hasDescription, rawAnsi: stored.rawAnsi, dsl: stored.dsl, text: stored.text, unmapped: stored.unmapped, at: stored.at };
  }

  private async storeDescription(
    record: WhoisicRecord,
    id: string,
    kind: CharacterKindName,
    codename: string,
    existing: StoredDescription | undefined,
  ): Promise<WhoisicOutcome> {
    const same =
      existing !== undefined &&
      existing.hasDescription === record.hasDescription &&
      existing.rawAnsi === record.rawAnsi &&
      JSON.stringify(existing.fields) === JSON.stringify(record.fields);
    if (same) {
      this.counters.descriptionsIgnored++;
      return 'unchanged';
    }
    const saved = await this.descriptions.append({
      id,
      codename,
      kind,
      at: record.at ?? this.options.now(),
      fields: record.fields,
      hasDescription: record.hasDescription,
      rawAnsi: record.rawAnsi,
      dsl: record.dsl,
      text: record.text,
      unmapped: record.unmapped,
    });
    if (!saved.ok) {
      this.counters.storeFailures++;
      return 'failed';
    }
    this.counters.descriptionsStored++;
    return 'stored';
  }

  /** The `Sex` field of a real character's description turns `Orion-U` into `Orion-M` or `Orion-F`. */
  private async learnGender(key: string, record: WhoisicRecord, id: string): Promise<void> {
    const sex = /^(male|female)$/i.exec(record.fields.Sex ?? '');
    if (sex === null) return;
    const gender: 'M' | 'F' = sex[1].toLowerCase() === 'male' ? 'M' : 'F';
    try {
      await setGender(key, gender, this.names);
    } catch {
      this.counters.storeFailures++;
      return;
    }
    const prior = this.index.get(id);
    if (prior !== undefined && prior.gender !== gender) await this.index.append({ ...prior, gender });
    if (this.active?.id === id) this.active.gender = gender;
  }

  // ---- reading ----------------------------------------------------------------------------------------------------------

  /** Every character that has played, newest first: codename, kind, gender and whether a description is stored. */
  list(): CharacterSummary[] {
    return this.index
      .query()
      .sort((a, b) => b.lastSeen - a.lastSeen || a.id.localeCompare(b.id))
      .map((r) => ({
        codename: formatCodename(r.codename, r.gender),
        kind: r.kind,
        gender: r.gender,
        hasDescription: this.descriptions.get(r.id)?.hasDescription === true,
      }));
  }

  /**
   * The stored description of a character, with every registered name in its text replaced by a codename. `codename` is the
   * `Base-G` form; a real character is found by its base whatever gender suffix a client still holds. Undefined when the
   * codename is unknown or no `whoisic` has been captured.
   */
  getDescription(codename: string): DescriptionView | undefined {
    const parts = CODENAME_PARAM.exec(codename);
    if (parts === null) return undefined;
    const [, base, gender] = parts;
    const found = this.index.query().find((r) => r.codename === base && (r.kind === 'real' || r.gender === gender));
    if (found === undefined) return undefined;
    const stored = this.descriptions.get(found.id);
    if (stored === undefined) return undefined;

    const entries = this.scrubEntries();
    const clean = (text: string): string => scrub(text, entries, { unknownNames: 'keep' }).text;
    return {
      codename: formatCodename(found.codename, found.gender),
      kind: found.kind,
      gender: found.gender,
      at: stored.at,
      fields: Object.fromEntries(Object.entries(stored.fields).map(([k, v]) => [k, clean(v)])),
      hasDescription: stored.hasDescription,
      rawAnsi: clean(stored.rawAnsi),
      dsl: clean(stored.dsl),
      text: clean(stored.text),
      unmapped: stored.unmapped,
    };
  }

  /**
   * Replace every registered name in `text` with its codename, and name-shaped words where the game prints a player name with
   * `<name>`. Everything shown to a model goes through this.
   */
  redact(text: string): string {
    return scrub(text, this.scrubEntries()).text;
  }

  private scrubEntries(): ScrubEntry[] {
    const real = this.names.names().map(({ key, record }) => ({ name: key, replacement: formatCodename(record.codename, record.gender) }));
    const test = (this.options.matrix?.entries() ?? []).map((e) => ({ name: e.name, replacement: formatCodename(e.codename, e.gender) }));
    return [...real, ...test];
  }

  /**
   * The one suggestion this service makes: read the active character's description when none has been captured. Null confidence,
   * so the policy always asks; it is never run without the owner. Only while connected.
   */
  descriptionSuggestion(connected: boolean): Suggestion | undefined {
    const active = this.active;
    if (!connected || active === undefined || this.descriptions.get(active.id) !== undefined) return undefined;
    return {
      id: `whoisic-${active.kind}-${active.codename}`,
      character: formatCodename(active.codename, active.gender),
      createdAt: this.options.now(),
      mode: 'exploration',
      sphere: 'interaction',
      kind: 'info',
      command: `whoisic ${active.name}`,
      rationale: 'No description is stored for this character yet; whoisic shows it so Copilot can learn who it is playing.',
      confidence: null,
      confidenceSource: 'model',
      situationKey: 'whoisic-self',
    };
  }
}
