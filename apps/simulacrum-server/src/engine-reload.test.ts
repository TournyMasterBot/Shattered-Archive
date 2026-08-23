import fs from 'fs';
import os from 'os';
import path from 'path';

import { EngineReloadError, EngineReloadWriter } from './engine-reload.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'engine-reload-'));
}

describe('EngineReloadWriter', () => {
  it('refuses every mode when disabled', () => {
    const dir = tmpDir();
    const writer = new EngineReloadWriter(dir, false);
    expect(() => writer.requestReload('hot', 'midgaard.are')).toThrow(EngineReloadError);
    expect(() => writer.requestReload('copyover')).toThrow(EngineReloadError);
    expect(fs.existsSync(path.join(dir, 'reload.signal'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'copyover.signal'))).toBe(false);
  });

  it('hot mode writes reload.signal at the area dir top level with "<file>\\n" content', () => {
    const dir = tmpDir();
    const writer = new EngineReloadWriter(dir, true);
    const { signalPath } = writer.requestReload('hot', 'midgaard.are');
    expect(signalPath).toBe(path.join(dir, 'reload.signal'));
    expect(fs.readFileSync(signalPath, 'utf8')).toBe('midgaard.are\n');
  });

  it('copyover mode writes copyover.signal with a bare newline (pure trigger, no payload)', () => {
    const dir = tmpDir();
    const writer = new EngineReloadWriter(dir, true);
    const { signalPath } = writer.requestReload('copyover');
    expect(signalPath).toBe(path.join(dir, 'copyover.signal'));
    expect(fs.readFileSync(signalPath, 'utf8')).toBe('\n');
  });

  it('hot mode requires a file name', () => {
    const dir = tmpDir();
    const writer = new EngineReloadWriter(dir, true);
    expect(() => writer.requestReload('hot')).toThrow(/requires "file"/);
  });

  it('rejects a path-traversal or non-.are file name, never writing outside the area dir', () => {
    const dir = tmpDir();
    const writer = new EngineReloadWriter(dir, true);
    expect(() => writer.requestReload('hot', '../../etc/passwd')).toThrow(EngineReloadError);
    expect(() => writer.requestReload('hot', 'midgaard.txt')).toThrow(EngineReloadError);
    expect(() => writer.requestReload('hot', '.hidden.are')).toThrow(EngineReloadError);
  });

  it('a second hot reload for a different file overwrites the signal (last write wins, matching the C side unlinking after each read)', () => {
    const dir = tmpDir();
    const writer = new EngineReloadWriter(dir, true);
    writer.requestReload('hot', 'midgaard.are');
    writer.requestReload('hot', 'newhaven.are');
    expect(fs.readFileSync(path.join(dir, 'reload.signal'), 'utf8')).toBe('newhaven.are\n');
  });
});
