import { rejoinSequences, stripAnsi } from '../color/ansi.js';
import { ansiToDsl } from '../color/ansiToDsl.js';

/**
 * The parsed result of one `whoisic <name>` output block.
 *
 * `name` is a REAL character name taken from the header. It exists only so the caller can resolve it to a codename at
 * once; it must never be logged, committed, sent to a model or placed in a bundle (docs/standards/edge-cases/game-data-privacy.md).
 */
export interface WhoisicRecord {
  name: string;
  /** Appearance fields by their label as shown ("Eyes", "Hair Length", "Profession"), values without colour. */
  fields: Record<string, string>;
  /** False when the block has no description text (E7): the three text values below are then empty. */
  hasDescription: boolean;
  /** The description exactly as sent, ANSI included, with the wrapped escape sequences rejoined. */
  rawAnsi: string;
  /** The same text with ANSI converted to DSL colour codes. */
  dsl: string;
  /** The same text with all colour removed. */
  text: string;
  /** ANSI sequences with no DSL equivalent (flagged, not guessed). */
  unmapped: string[];
  /** Epoch ms of the header line in the log, when the caller knows it. */
  at?: number;
}

const HEADER = /^IC Information for (.+)\.\s*$/;
const RULE = /^-{10,}\s*$/;
// A field label starts a line or follows two or more spaces; two-word labels ("Hair Length", "Facial Hair") are capitalised.
const LABEL = /(^|\s{2,})([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*):(?=\s|$)/g;

function isBlank(row: string): boolean {
  return stripAnsi(row).trim() === '';
}

function parseFieldRow(visible: string, into: Record<string, string>): void {
  const labels: { label: string; valueStart: number; labelStart: number }[] = [];
  LABEL.lastIndex = 0;
  for (let m = LABEL.exec(visible); m !== null; m = LABEL.exec(visible)) {
    const labelStart = m.index + m[1].length;
    labels.push({ label: m[2], labelStart, valueStart: m.index + m[0].length });
  }
  labels.forEach((entry, i) => {
    const end = i + 1 < labels.length ? labels[i + 1].labelStart : visible.length;
    into[entry.label] = visible.slice(entry.valueStart, end).trim();
  });
}

/**
 * Parse the lines of one `whoisic` block, starting at (or before) the "IC Information for X." header and running to the
 * end of the block. Returns null when there is no header. The block layout, as the game sends it:
 *
 *     IC Information for X.            header
 *     -----------------------------    rule 1
 *     Eyes: ...      Hair: ...         appearance fields in two columns, then "Feature: ..."
 *     -----------------------------    rule 2
 *     Profession: ..  Age: ..  Sex: .. one row of three columns
 *     -----------------------------    rule 3
 *     (free-text description, hard-wrapped, with colour)
 *
 * A block cut after rule 2 or 3 is a character with no description: `hasDescription` is false and the text is empty.
 */
export function parseWhoisic(lines: readonly string[], at?: number): WhoisicRecord | null {
  const rows = rejoinSequences(lines.map((l) => l.replace(/\r$/, '')).join('\n')).split('\n');

  let headerIndex = -1;
  let name = '';
  for (let i = 0; i < rows.length; i++) {
    const m = HEADER.exec(stripAnsi(rows[i]));
    if (m) {
      headerIndex = i;
      name = m[1].trim();
      break;
    }
  }
  if (headerIndex < 0 || name === '') return null;

  const ruleRows: number[] = [];
  for (let i = headerIndex + 1; i < rows.length && ruleRows.length < 3; i++) {
    if (RULE.test(stripAnsi(rows[i]))) ruleRows.push(i);
  }

  const fieldEnd = ruleRows.length >= 3 ? ruleRows[2] : rows.length;
  const fields: Record<string, string> = {};
  for (let i = headerIndex + 1; i < fieldEnd; i++) {
    const visible = stripAnsi(rows[i]);
    if (RULE.test(visible)) continue;
    parseFieldRow(visible, fields);
  }

  let descriptionRows = ruleRows.length >= 3 ? rows.slice(ruleRows[2] + 1) : [];
  while (descriptionRows.length > 0 && isBlank(descriptionRows[0])) descriptionRows = descriptionRows.slice(1);
  while (descriptionRows.length > 0 && isBlank(descriptionRows[descriptionRows.length - 1])) {
    descriptionRows = descriptionRows.slice(0, -1);
  }

  const rawAnsi = descriptionRows.join('\n');
  const { dsl, unmapped } = ansiToDsl(rawAnsi);
  const text = stripAnsi(rawAnsi);
  const hasDescription = text.trim() !== '';

  const record: WhoisicRecord = {
    name,
    fields,
    hasDescription,
    rawAnsi: hasDescription ? rawAnsi : '',
    dsl: hasDescription ? dsl : '',
    text: hasDescription ? text : '',
    unmapped: hasDescription ? unmapped : [],
  };
  if (at !== undefined) record.at = at;
  return record;
}

/**
 * The newest of two records for the same character. A record with a time beats one without; on equal times the second
 * argument wins (it was read later from the same log).
 */
export function pickNewestWhoisic(a: WhoisicRecord, b: WhoisicRecord): WhoisicRecord {
  if (a.at === undefined) return b;
  if (b.at === undefined) return a;
  return b.at >= a.at ? b : a;
}
