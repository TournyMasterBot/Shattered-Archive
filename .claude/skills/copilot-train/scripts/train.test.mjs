/* global URL */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateAnswer, WHY_MAX } from './lib/answers.mjs';
import { pilotLaunchOptions } from './lib/headed.mjs';
import { appendEntry, areaOfCommand, entryFor, FOCUS_AREAS, readEntries, summarize } from './lib/sessionLog.mjs';

test('the pilot is always visible: launch options are headed, and any request for a hidden one is refused', () => {
  assert.deepEqual(pilotLaunchOptions([], {}), { headless: false, contextOptions: { viewport: { width: 1440, height: 900 } } });
  for (const argv of [['--headless'], ['--hidden'], ['--headless=true'], ['--hidden=1']]) assert.throws(() => pilotLaunchOptions(argv, {}), /always visible/);
  for (const key of ['HEADLESS', 'PLAYWRIGHT_HEADLESS', 'PWHEADLESS']) for (const value of ['1', 'true', 'YES', 'on']) assert.throws(() => pilotLaunchOptions([], { [key]: value }), /always visible/);
  assert.equal(pilotLaunchOptions(['--dir', 'x'], { HEADLESS: '0', PLAYWRIGHT_HEADLESS: 'false' }).headless, false);
});

test('the pilot script itself never asks for a hidden browser', () => {
  const pilot = fs.readFileSync(new URL('./pilot.mjs', import.meta.url), 'utf8');
  assert.match(pilot, /pilotLaunchOptions\(process\.argv\.slice\(2\), process\.env\)/);
  assert.doesNotMatch(pilot, /headless:\s*true/);
});

test('validateAnswer: approve, wait and stop need little; the others need the source', () => {
  assert.deepEqual(validateAnswer({ id: 's1', action: 'approve' }, 's1'), { ok: true, answer: { action: 'approve', id: 's1' } });
  assert.deepEqual(validateAnswer({ id: 's1', action: 'wait' }, 's1'), { ok: true, answer: { action: 'wait', id: 's1' } });
  assert.deepEqual(validateAnswer({ action: 'stop' }, undefined), { ok: true, answer: { action: 'stop' } });
  assert.deepEqual(validateAnswer({ id: 's1', action: 'reject', why: 'fight.c do_flee: a flee costs 10 exp' }, 's1'), { ok: true, answer: { action: 'reject', id: 's1', why: 'fight.c do_flee: a flee costs 10 exp' } });
  assert.deepEqual(validateAnswer({ id: 's1', action: 'correct', command: ' consider goblin ', why: 'act_info.c   do_consider:\nconsider first' }, 's1'), {
    ok: true,
    answer: { action: 'correct', id: 's1', command: 'consider goblin', why: 'act_info.c do_consider: consider first' },
  });
});

test('validateAnswer refuses what would send nothing useful or something unsafe', () => {
  const bad = (input, id = 's1') => validateAnswer(input, id);
  for (const input of [null, [], 'approve', {}, { action: 'dance', id: 's1' }]) assert.equal(bad(input).ok, false);
  assert.match(bad({ action: 'approve' }).problem, /id is required/);
  assert.match(bad({ id: 's2', action: 'approve' }).problem, /another suggestion/);
  assert.match(bad({ id: 's1', action: 'correct', command: 'look' }).problem, /needs a why/);
  assert.match(bad({ id: 's1', action: 'reject', why: 'it is just wrong' }).problem, /cite the merc-mud source/);
  assert.match(bad({ id: 's1', action: 'reject', why: `fight.c ${'x'.repeat(WHY_MAX)}` }).problem, /over 280/);
  assert.match(bad({ id: 's1', action: 'correct', why: 'act_info.c' }).problem, /command to send instead/);
  assert.match(bad({ id: 's1', action: 'correct', command: 'x'.repeat(201), why: 'act_info.c' }).problem, /over 200/);
  for (const command of ['north\nsouth', 'kill orc; flee', 'a\u0000b']) assert.match(bad({ id: 's1', action: 'correct', command, why: 'act_info.c' }).problem, /no line break/);
});

test('areaOfCommand sorts a command into the seven focus areas, and spells by what they do', () => {
  const cases = {
    'north': 'navigating', 'recall': 'navigating', 'open door': 'interacting', 'look': 'interacting', 'list': 'interacting',
    'kill goblin': 'fighting', 'consider goblin': 'fighting', 'flee': 'fighting', 'get sword': 'inventory', 'wear sword': 'inventory',
    'inventory': 'inventory', 'affects': 'buffs', "cast 'armor'": 'buffs', "cast 'cure light'": 'healing', 'cast fireball goblin': 'fighting',
    'rest': 'healing', 'quaff potion': 'healing', 'score': 'stats', 'practice': 'stats',
  };
  for (const [command, area] of Object.entries(cases)) assert.equal(areaOfCommand(command), area, command);
  assert.equal(areaOfCommand('xyzzy'), undefined);
  assert.equal(areaOfCommand(''), undefined);
  assert.deepEqual(FOCUS_AREAS, ['navigating', 'interacting', 'fighting', 'inventory', 'buffs', 'healing', 'stats']);
});

test('the session log: one entry per answer, appended, read back, and summarised by area with what is untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'train-'));
  try {
    const file = path.join(dir, 'sessions', 'a.jsonl');
    const pending = { id: 's1', sphere: 'fighting', kind: 'fight-start-unknown', command: 'kill goblin', rationale: 'level', situation: 'exploration:cave' };
    const corrected = entryFor(pending, { action: 'correct', command: 'consider goblin', why: 'act_info.c do_consider' }, Date.UTC(2026, 10, 11, 12, 0, 0));
    assert.deepEqual(corrected, {
      at: '2026-11-11T12:00:00.000Z', suggestionId: 's1', sphere: 'fighting', kind: 'fight-start-unknown', command: 'kill goblin', rationale: 'level',
      situation: 'exploration:cave', action: 'correct', area: 'fighting', corrected: 'consider goblin', why: 'act_info.c do_consider',
    });
    appendEntry(file, corrected);
    appendEntry(file, entryFor({ ...pending, id: 's2', command: 'north' }, { action: 'approve' }, 0));
    appendEntry(file, entryFor({ ...pending, id: 's3', command: 'zzz' }, { action: 'reject', why: 'fight.c' }, 0));
    fs.appendFileSync(file, 'not json\n');
    const entries = readEntries(file);
    assert.equal(entries.length, 3);
    const summary = summarize(entries);
    assert.equal(summary.total, 3);
    assert.deepEqual(summary.byArea.fighting, { approve: 0, correct: 1, reject: 0 });
    assert.deepEqual(summary.byArea.navigating, { approve: 1, correct: 0, reject: 0 });
    assert.deepEqual(summary.byArea.other, { approve: 0, correct: 0, reject: 1 });
    assert.deepEqual(summary.untouched, ['interacting', 'inventory', 'buffs', 'healing', 'stats']);
    assert.deepEqual(readEntries(path.join(dir, 'missing.jsonl')), []);
    assert.deepEqual(summarize([{ area: 'fighting', action: 'dance' }]).byArea.fighting, { approve: 0, correct: 0, reject: 0 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
