import fs from 'fs';
import path from 'path';

import { parseAreaFile, ParseError } from './parse.js';
import { emitAreaFile } from './emit.js';
import { validateScripts, MAX_SCRIPT_LINES } from './validate.js';
import type { ScriptsSection } from './types.js';
import { SCRIPT_TRIGGERS } from './types.js';

// Jest runs with cwd = package root (pnpm --filter / local jest.config.cjs).
const fixture = (name: string) => fs.readFileSync(path.resolve('src/__fixtures__', name), 'utf8');

const AREA_WITH_SCRIPTS = `#AREA
scripted.are~
Scripted~
{ 5 35} Test    Scripted Area~
3700 3799

#SCRIPTS
M 3700 speech hello~
say Hello yourself, $n!
bow~
M 3700 greet 100~
smile~
M 3701 rand 25~
emote shuffles some papers.~
#0

#$
`;

describe('#SCRIPTS section', () => {
  it('parses entries with multi-line bodies', () => {
    const area = parseAreaFile(AREA_WITH_SCRIPTS);
    const scripts = area.sections.find((s) => s.kind === 'scripts') as ScriptsSection;
    expect(scripts.scripts).toHaveLength(3);
    expect(scripts.scripts[0]).toEqual({
      mobVnum: 3700,
      trigger: 'speech',
      phrase: 'hello',
      body: 'say Hello yourself, $n!\nbow',
    });
    expect(scripts.scripts[1]).toEqual({
      mobVnum: 3700,
      trigger: 'greet',
      phrase: '100',
      body: 'smile',
    });
    expect(scripts.scripts[2].trigger).toBe('rand');
  });

  it('round-trips: parse(emit(parse(x))) deep-equals parse(x) and emit is byte-stable', () => {
    const once = parseAreaFile(AREA_WITH_SCRIPTS);
    const emitted = emitAreaFile(once);
    const twice = parseAreaFile(emitted);
    expect(twice).toEqual(once);
    expect(emitAreaFile(twice)).toBe(emitted);
  });

  it('emits nothing script-related for areas without the section', () => {
    const limbo = fixture('limbo.are');
    const area = parseAreaFile(limbo);
    expect(area.sections.some((s) => s.kind === 'scripts')).toBe(false);
    expect(emitAreaFile(area)).not.toContain('#SCRIPTS');
  });

  it('rejects a bad entry letter with a line-numbered error', () => {
    const bad = AREA_WITH_SCRIPTS.replace('M 3701', 'Q 3701');
    expect(() => parseAreaFile(bad)).toThrow(ParseError);
    expect(() => parseAreaFile(bad)).toThrow(/Load_scripts: expected 'M' or '#0'/);
  });

  it('rejects a non-zero # terminator', () => {
    const bad = AREA_WITH_SCRIPTS.replace('#0\n\n#$', '#5\n\n#$');
    expect(() => parseAreaFile(bad)).toThrow(/Load_scripts: expected #0 terminator/);
  });

  it('exposes the trigger vocabulary shared with mob_prog.c', () => {
    expect(SCRIPT_TRIGGERS).toContain('speech');
    expect(SCRIPT_TRIGGERS).toContain('rand');
    expect(SCRIPT_TRIGGERS).toHaveLength(9);
  });
});

describe('validateScripts (mirror of the C-side checks)', () => {
  const base = () =>
    parseAreaFile(
      '#AREA\nv.are~\nV~\n{ 1 1} T V~\n1 2\n\n' +
        '#MOBILES\n#7001\nguard~\nthe guard~\nA guard stands here.\n~\nHe is big.\n~\nhuman~\n' +
        '1 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown\n#0\n\n' +
        '#SCRIPTS\nM 7001 speech hi~\nsay hi~\n#0\n\n#$\n',
    );

  it('passes a well-formed area and reports counts', () => {
    const summary = validateScripts(base());
    expect(summary.errors).toEqual([]);
    expect(summary.count).toBe(1);
    expect(summary.perMob).toEqual([{ mobVnum: 7001, count: 1 }]);
  });

  it('flags unknown triggers, foreign mobs, and over-budget bodies', () => {
    const area = base();
    const scripts = area.sections.find((s) => s.kind === 'scripts') as ScriptsSection;
    scripts.scripts.push(
      { mobVnum: 7001, trigger: 'sneeze', phrase: '', body: 'say x' },
      { mobVnum: 9999, trigger: 'speech', phrase: 'a', body: 'say y' },
      { mobVnum: 7001, trigger: 'rand', phrase: '50', body: Array(MAX_SCRIPT_LINES + 1).fill('say z').join('\n') },
    );
    const summary = validateScripts(area);
    expect(summary.errors).toHaveLength(3);
    expect(summary.errors[0]).toContain("unknown trigger 'sneeze'");
    expect(summary.errors[1]).toContain('mob 9999');
    expect(summary.errors[2]).toContain(`max ${MAX_SCRIPT_LINES}`);
  });
});
