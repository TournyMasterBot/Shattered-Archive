import { gunzipSync, gzipSync } from 'node:zlib';
import { candidatesMap } from '../testing/neutralFixtures';
import { doc, room } from '../testing/fixtures';
import { classify, openFile, openText, readFileText, type FileLike } from './fileio';

const bytes = (text: string | Uint8Array): ArrayBuffer => {
  const u = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};
const file = (name: string, content: string | Uint8Array): FileLike => ({ name, arrayBuffer: async () => bytes(content) });
const gunzip = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(gunzipSync(b));

describe('classify', () => {
  it('recognises a valid map file, and returns it typed', () => {
    const out = classify(candidatesMap());
    expect(out.kind).toBe('map');
  });

  it('refuses a map file that fails the strict validator, with the reasons', () => {
    const broken = candidatesMap();
    broken.links[0].to = 'r-not-here';
    const out = classify(broken);
    expect(out.kind).toBe('refused');
    expect(out.kind === 'refused' && out.errors[0]).toMatch(/^Not a valid map file: /);
  });

  it('recognises a DslMapper document by its two parts', () => {
    expect(classify(doc([room('a', 0, 0, 0, {})])).kind).toBe('legacy');
  });

  it('refuses everything else: not an object, an array, null, other objects', () => {
    for (const value of [null, 3, 'text', [], {}, { meta: {} }, { rooms: {} }, { meta: null, rooms: {} }, { meta: {}, rooms: [] }, { continents: [] }]) {
      expect(classify(value).kind).toBe('refused');
    }
    expect(classify([]) ).toEqual({ kind: 'refused', errors: ['The file is not a map: it is not a JSON object.'] });
  });
});

describe('openText', () => {
  it('parses JSON and classifies it; text that is not JSON is refused', () => {
    expect(openText(JSON.stringify(candidatesMap())).kind).toBe('map');
    expect(openText('{ nope')).toEqual({ kind: 'refused', errors: ['The file is not valid JSON.'] });
  });
});

describe('readFileText and openFile', () => {
  it('reads a plain file as UTF-8 text, including characters outside ASCII', async () => {
    expect(await readFileText(file('a.json', '{"title":"Café ☕"}'), null)).toBe('{"title":"Café ☕"}');
  });

  it('recognises gzip by its first two bytes (not by the name) and unpacks it', async () => {
    const zipped = gzipSync(JSON.stringify(candidatesMap()));
    expect(await readFileText(file('plain-name.json', new Uint8Array(zipped)), gunzip)).toBe(JSON.stringify(candidatesMap()));
    expect((await openFile(file('a.json.gz', new Uint8Array(zipped)), gunzip)).kind).toBe('map');
  });

  it('says so when a gzip file is opened where the browser cannot unpack it', async () => {
    const out = await openFile(file('a.json.gz', new Uint8Array(gzipSync('{}'))), null);
    expect(out).toEqual({ kind: 'refused', errors: ['This browser cannot read gzip files (no DecompressionStream). Unpack the file and open the .json.'] });
  });

  it('treats a one-byte or empty file as text, not as gzip', async () => {
    expect(await readFileText(file('e', ''), null)).toBe('');
    expect(await readFileText(file('e', new Uint8Array([0x1f])), null)).toBe('\u001f');
    expect((await openFile(file('e', ''), null)).kind).toBe('refused');
  });

  it('turns a read failure into a refusal, whatever was thrown', async () => {
    const failing: FileLike = { name: 'x', arrayBuffer: async () => Promise.reject(new Error('disk gone')) };
    expect(await openFile(failing, null)).toEqual({ kind: 'refused', errors: ['disk gone'] });
    const odd: FileLike = { name: 'x', arrayBuffer: () => Promise.reject('plain string') };
    expect(await openFile(odd, null)).toEqual({ kind: 'refused', errors: ['The file could not be read.'] });
  });

  it('refuses a gzip file whose content is damaged', async () => {
    const zipped = new Uint8Array(gzipSync('{}'));
    const broken = zipped.slice(0, 12);
    const out = await openFile(file('a.json.gz', broken), gunzip);
    expect(out.kind).toBe('refused');
  });
});
