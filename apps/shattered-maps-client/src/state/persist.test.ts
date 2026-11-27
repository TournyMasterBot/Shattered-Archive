import { clearLocal, exportToFile, importFromFile, loadFromLocal, saveToLocal, STORAGE_KEY } from './persist';
import { sampleDoc } from '../testing/fixtures';

beforeEach(() => {
  localStorage.clear();
});

describe("autosave in the browser's storage", () => {
  it('saves a document under one key and loads the same document back', () => {
    const doc = sampleDoc();
    const before = Date.now();
    const { savedAt } = saveToLocal(doc);
    expect(savedAt).toBeGreaterThanOrEqual(before);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(doc));
    expect(loadFromLocal()).toEqual(doc);
    expect(STORAGE_KEY).toBe('dslmapper.autosave');
  });

  it('loads nothing when nothing was saved, and nothing from text that is not JSON', () => {
    expect(loadFromLocal()).toBeNull();
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadFromLocal()).toBeNull();
    localStorage.setItem(STORAGE_KEY, '');
    expect(loadFromLocal()).toBeNull();
  });

  it('replaces an earlier save, and clears it', () => {
    saveToLocal(sampleDoc('First'));
    saveToLocal(sampleDoc('Second'));
    expect(loadFromLocal()?.meta.catalog?.areas.a1.name).toBe('Second');
    clearLocal();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadFromLocal()).toBeNull();
    expect(() => clearLocal()).not.toThrow();
  });
});

describe('files', () => {
  // jsdom's Blob and File have no `.text()` (every browser does): give them one, built on the FileReader jsdom does have
  beforeAll(() => {
    if (typeof Blob.prototype.text !== 'function') {
      Blob.prototype.text = function text(this: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(this);
        });
      };
    }
  });

  it('exports JSON through a temporary link named for the file, and cleans up', async () => {
    const urls: Blob[] = [];
    const created = jest.fn((blob: Blob) => (urls.push(blob), 'blob:test'));
    const revoked = jest.fn();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
    const clicked: { download: string; href: string }[] = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });

    exportToFile({ a: 1, b: ['x'] }, 'map.json');

    expect(clicked).toEqual([{ download: 'map.json', href: 'blob:test' }]);
    expect(urls[0].type).toBe('application/json;charset=utf-8');
    expect(await urls[0].text()).toBe(JSON.stringify({ a: 1, b: ['x'] }, null, 2));
    expect(revoked).toHaveBeenCalledWith('blob:test');
    expect(document.querySelector('a[download]')).toBeNull(); // the link is removed again
    click.mockRestore();
  });

  it('reads a document from a file', async () => {
    const doc = sampleDoc();
    const file = new File([JSON.stringify(doc)], 'map.json', { type: 'application/json' });
    expect(await importFromFile(file)).toEqual(doc);
  });

  it('refuses a file that is not JSON by rejecting', async () => {
    await expect(importFromFile(new File(['nope'], 'x.json'))).rejects.toThrow();
  });
});
