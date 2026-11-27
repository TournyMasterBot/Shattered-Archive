import { createHash } from 'node:crypto';
import { isSafeRelativePath, parseCheckpoints, serializeCheckpoints, type Checkpoint } from './checkpoints';

const sha = (s: string): string => createHash('sha1').update(s).digest('hex');
const good: Checkpoint = { path: '2026/11/05/server.log-2026-11-06.jsonl', offset: 300, size: 320, fpLen: 256, fp: sha('prefix') };

describe('isSafeRelativePath', () => {
  it.each(['a.jsonl', '2026/11/05/x.jsonl', 'a b/c.jsonl'])('accepts %s', (p) => expect(isSafeRelativePath(p)).toBe(true));

  it.each([
    ['', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['C:/x.jsonl', 'drive letter'],
    ['..\\x', 'backslash'],
    ['../x.jsonl', 'parent'],
    ['a/../x.jsonl', 'parent inside'],
    ['./x.jsonl', 'dot'],
    ['a//x.jsonl', 'empty segment'],
    ['a/\0.jsonl', 'NUL'],
  ])('rejects %j (%s)', (p) => expect(isSafeRelativePath(p)).toBe(false));

  it('rejects a non-string', () => expect(isSafeRelativePath(5)).toBe(false));
});

describe('parseCheckpoints / serializeCheckpoints', () => {
  it('round-trips a checkpoint file', () => {
    const text = serializeCheckpoints({ baselined: true, files: [good] });
    expect(parseCheckpoints(text)).toEqual({ baselined: true, files: [good] });
  });

  it('keeps a checkpoint with nothing consumed yet (no fingerprint)', () => {
    const empty: Checkpoint = { path: 'a.jsonl', offset: 0, size: 0, fpLen: 0, fp: '' };
    expect(parseCheckpoints(serializeCheckpoints({ baselined: false, files: [empty] }))).toEqual({ baselined: false, files: [empty] });
  });

  it.each([undefined, '', '{not json', 'null', '[]', '{"v":2,"files":[]}', '{"v":1}', '{"v":1,"files":"x"}'])('reads %j as "nothing known"', (text) => {
    expect(parseCheckpoints(text)).toEqual({ baselined: false, files: [] });
  });

  it('drops entries that are malformed or could leave the log folder, and keeps the good ones', () => {
    const bad = [
      { ...good, path: '../../etc/passwd' },
      { ...good, path: '/abs.jsonl' },
      { ...good, offset: -1 },
      { ...good, size: 1.5 },
      { ...good, fpLen: 300 },
      { ...good, fpLen: 400, offset: 500 },
      { ...good, offset: 10, fpLen: 20 },
      { ...good, fp: 'nothex' },
      { ...good, fp: 5 },
      { ...good, fpLen: 0, fp: sha('x') },
      { path: 'a.jsonl' },
      null,
      'text',
    ];
    const text = JSON.stringify({ v: 1, baselined: true, files: [...bad, good] });
    expect(parseCheckpoints(text)).toEqual({ baselined: true, files: [good] });
  });

  it('keeps the first of two entries for one path', () => {
    const second = { ...good, offset: 301 };
    expect(parseCheckpoints(JSON.stringify({ v: 1, baselined: true, files: [good, second] })).files).toEqual([good]);
  });

  it('is not baselined unless the flag is exactly true', () => {
    expect(parseCheckpoints(JSON.stringify({ v: 1, baselined: 'yes', files: [] })).baselined).toBe(false);
  });
});
