import fs from 'fs';
import os from 'os';
import path from 'path';

import { AuditLog } from './audit-log.js';

describe('AuditLog', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('appends one JSONL line per entry with a timestamp', () => {
    const log = new AuditLog(dir);
    log.append({ actorId: 'a1', actorUsername: 'root', action: 'set-global-role', targetId: 't1', targetUsername: 'kid', detail: 'moderator' });
    log.append({ actorId: 'a1', actorUsername: 'root', action: 'temp-password', targetId: 't1', targetUsername: 'kid' });

    const lines = fs.readFileSync(path.join(dir, 'audit.log'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.action).toBe('set-global-role');
    expect(first.detail).toBe('moderator');
    expect(Date.parse(first.at)).not.toBeNaN();
    expect(JSON.parse(lines[1]).action).toBe('temp-password');
  });
});
