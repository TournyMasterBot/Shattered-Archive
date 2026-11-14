import { DSL_PACKAGES, findPackage, type FieldSpec, type PackageSpec } from './dslGmcpSchema';

/**
 * Compares captured simulacrum GMCP with DSL's (dslGmcpSchema.ts). Pure: no events, no storage. A finding never repeats free text: the
 * offending value is included only for fields that have a value set or a pattern (enum-like words and the game clock).
 */

export type Severity = 'error' | 'warn' | 'info';

export type FindingCode =
  | 'unknown-package'
  | 'not-an-object'
  | 'missing-field'
  | 'wrong-type'
  | 'value-outside-set'
  | 'value-not-seen'
  | 'known-difference'
  | 'bad-pattern'
  | 'extra-field';

export interface Finding {
  severity: Severity;
  code: FindingCode;
  /** `sector`, `exits[]`, `affects[].lc` ... */
  path: string;
  message: string;
  /** Only for enum-like fields. */
  value?: string;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkValue(path: string, spec: FieldSpec, value: unknown, out: Finding[]): void {
  if (spec.type === 'string[]') {
    if (!Array.isArray(value)) {
      out.push({ severity: 'error', code: 'wrong-type', path, message: `expected an array of strings, got ${typeOf(value)}` });
      return;
    }
    value.forEach((item) => {
      if (typeof item !== 'string') {
        out.push({ severity: 'error', code: 'wrong-type', path: `${path}[]`, message: `expected a string, got ${typeOf(item)}` });
        return;
      }
      checkWord(`${path}[]`, spec, item, out);
    });
    return;
  }

  if (typeOf(value) !== spec.type) {
    out.push({ severity: 'error', code: 'wrong-type', path, message: `expected ${spec.type}, got ${typeOf(value)}` });
    return;
  }
  if (spec.type === 'string') checkWord(path, spec, value as string, out);
}

function checkWord(path: string, spec: FieldSpec, word: string, out: Finding[]): void {
  if (spec.pattern && !spec.pattern.test(word)) {
    out.push({ severity: 'warn', code: 'bad-pattern', path, message: 'not in the game-clock form DSL sends (H:00am or H:30pm)', value: word });
  }
  if (!spec.values || spec.values.includes(word)) return;
  if (spec.knownDifferences?.includes(word)) {
    out.push({ severity: 'info', code: 'known-difference', path, message: 'differs from DSL by decision', value: word });
  } else if (spec.strictValues) {
    out.push({ severity: 'warn', code: 'value-outside-set', path, message: 'not a value DSL sends for this field', value: word });
  } else {
    out.push({ severity: 'info', code: 'value-not-seen', path, message: 'a value DSL has not been seen to send', value: word });
  }
}

function checkFields(prefix: string, fields: Readonly<Record<string, FieldSpec>>, data: Record<string, unknown>, out: Finding[]): void {
  for (const [key, spec] of Object.entries(fields)) {
    const path = `${prefix}${key}`;
    if (!(key in data)) {
      if (!spec.optional) out.push({ severity: 'error', code: 'missing-field', path, message: 'DSL always sends this field' });
      continue;
    }
    checkValue(path, spec, data[key], out);
  }
  for (const key of Object.keys(data)) {
    if (!(key in fields)) out.push({ severity: 'info', code: 'extra-field', path: `${prefix}${key}`, message: 'DSL does not send this field' });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The differences between one message and DSL's version of that package. An empty list means it is the same shape. */
export function checkMessage(pkg: string, data: unknown): Finding[] {
  const spec = findPackage(pkg);
  if (!spec) return [{ severity: 'warn', code: 'unknown-package', path: '', message: 'DSL does not send this package' }];
  if (!isPlainObject(data)) return [{ severity: 'error', code: 'not-an-object', path: '', message: `the payload is ${typeOf(data)}, not a JSON object` }];

  const out: Finding[] = [];
  // the list field (`affects`) is checked element by element below, so it must not also be reported as an extra top-level field
  checkFields('', spec.fields, spec.list ? withoutKey(data, spec.list.key) : data, out);

  const listSpec = spec.list;
  if (listSpec) {
    const list = data[listSpec.key];
    if (!(listSpec.key in data)) out.push({ severity: 'error', code: 'missing-field', path: listSpec.key, message: 'DSL always sends this field' });
    else if (!Array.isArray(list)) out.push({ severity: 'error', code: 'wrong-type', path: listSpec.key, message: `expected an array, got ${typeOf(list)}` });
    else {
      list.forEach((element) => {
        if (!isPlainObject(element)) {
          out.push({ severity: 'error', code: 'wrong-type', path: `${listSpec.key}[]`, message: `expected an object, got ${typeOf(element)}` });
          return;
        }
        checkFields(`${listSpec.key}[].`, listSpec.fields, element, out);
      });
    }
  }
  return out;
}

function withoutKey(data: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));
}

export interface CheckedEntry {
  pkg: string;
  /** Parsed JSON; undefined when it could not be parsed. */
  data?: unknown;
  parseError?: string;
}

export interface AggregatedFinding extends Finding {
  /** How many messages had it. */
  count: number;
}

export type PackageStatus = 'not-seen' | 'match' | 'noted' | 'differs';

export interface PackageReport {
  name: string;
  seen: number;
  status: PackageStatus;
  findings: AggregatedFinding[];
}

export interface ParityReport {
  /** Every DSL package, in DSL's order, whether or not it was seen. */
  packages: PackageReport[];
  /** Packages that arrived and are not DSL's, with how often. */
  unknownPackages: { name: string; seen: number }[];
  /** Messages that could not be parsed at all. */
  unparsable: number;
  checked: number;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

function statusOf(seen: number, findings: AggregatedFinding[]): PackageStatus {
  if (seen === 0) return 'not-seen';
  if (findings.some((f) => f.severity !== 'info')) return 'differs';
  return findings.length > 0 ? 'noted' : 'match';
}

/** One report for a whole capture: per DSL package, how often it was seen and every distinct difference with its count. */
export function buildParityReport(entries: readonly CheckedEntry[]): ParityReport {
  const seen = new Map<string, number>();
  const found = new Map<string, Map<string, AggregatedFinding>>();
  const unknown = new Map<string, number>();
  let unparsable = 0;

  for (const entry of entries) {
    if (!findPackage(entry.pkg)) {
      unknown.set(entry.pkg, (unknown.get(entry.pkg) ?? 0) + 1);
      continue;
    }
    seen.set(entry.pkg, (seen.get(entry.pkg) ?? 0) + 1);
    if (entry.parseError !== undefined || entry.data === undefined) {
      unparsable++;
      continue;
    }
    const perPackage = found.get(entry.pkg) ?? new Map<string, AggregatedFinding>();
    found.set(entry.pkg, perPackage);
    for (const finding of checkMessage(entry.pkg, entry.data)) {
      const key = `${finding.code}|${finding.path}|${finding.value ?? ''}`;
      const existing = perPackage.get(key);
      if (existing) existing.count++;
      else perPackage.set(key, { ...finding, count: 1 });
    }
  }

  const packages = DSL_PACKAGES.map((spec: PackageSpec): PackageReport => {
    const count = seen.get(spec.name) ?? 0;
    const findings = [...(found.get(spec.name)?.values() ?? [])].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count || a.path.localeCompare(b.path),
    );
    return { name: spec.name, seen: count, status: statusOf(count, findings), findings };
  });

  return {
    packages,
    unknownPackages: [...unknown].map(([name, n]) => ({ name, seen: n })).sort((a, b) => b.seen - a.seen),
    unparsable,
    checked: entries.length,
  };
}
