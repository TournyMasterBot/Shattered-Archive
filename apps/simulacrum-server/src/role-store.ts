import fs from 'fs';
import path from 'path';

import { SERVICE_TIERS, type ServiceTier } from '@shatteredarchive/services-server';

/**
 * AI-ANNOTATION
 * @ai-summary Exact mirror of mud-builder-server/src/role-store.ts — this service's
 *   `dataDir` is configured (Step 1) to point at a single-file bind mount onto
 *   mud-builder-server's OWN roles.json, so both processes' atomic tmp+rename writes
 *   land on the SAME file. That sharing is the point (Constraints: trusted+ tier is
 *   shared between mud-builder-server and simulacrum-server, not two independent
 *   lists) — the class itself is deliberately NOT imported across the app boundary,
 *   same rationale as auth-tiers.ts's own header documents for itself.
 * @ai-public RoleStore, RoleGrant
 * @ai-notes Same corrupt-file-locks-rather-than-resets idiom as mud-builder-server's
 *   AuthStore. An ABSENT file is just "no grants yet" — not expected in practice here,
 *   since the shared roles.json already exists (mud-builder-server created it first).
 */

export interface RoleGrant {
  accountId: string;
  username: string;
  tier: ServiceTier;
  grantedBy: string;
  grantedAt: string;
}

const ROLES_FILE = 'roles.json';

export function isServiceTier(value: unknown): value is ServiceTier {
  return typeof value === 'string' && (SERVICE_TIERS as readonly string[]).includes(value);
}

export class RoleStore {
  private readonly filePath: string;
  private grants: RoleGrant[] = [];
  private mtimeMs = 0;
  private locked = false;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, ROLES_FILE);
  }

  private load(): RoleGrant[] {
    if (this.locked) return this.grants;
    try {
      if (!fs.existsSync(this.filePath)) {
        this.grants = [];
        return this.grants;
      }
      const stat = fs.statSync(this.filePath);
      if (stat.mtimeMs === this.mtimeMs) return this.grants;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((g) => isRoleGrant(g))) {
        throw new Error('malformed roles file');
      }
      this.grants = parsed;
      this.mtimeMs = stat.mtimeMs;
    } catch (e) {
      this.locked = true;
      console.error(
        `[roles] cannot read ${this.filePath} (${(e as Error).message}) — role grants are LOCKED (read as empty) until the file is fixed or removed on the host`,
      );
    }
    return this.grants;
  }

  private persist(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.grants, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    this.mtimeMs = fs.statSync(this.filePath).mtimeMs;
  }

  /** No row for an account is a valid, common state — it means 'user' (the ladder's floor). */
  tierFor(accountId: string): ServiceTier {
    const row = this.load().find((g) => g.accountId === accountId);
    return row?.tier ?? 'user';
  }

  list(): RoleGrant[] {
    return this.load().slice();
  }

  /** Upserts a grant; the store itself does not enforce WHO may call this. */
  setTier(accountId: string, username: string, tier: ServiceTier, grantedBy: string): RoleGrant {
    const grants = this.load();
    const existing = grants.find((g) => g.accountId === accountId);
    const record: RoleGrant = { accountId, username, tier, grantedBy, grantedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, record);
    else grants.push(record);
    this.persist();
    return record;
  }
}

function isRoleGrant(value: unknown): value is RoleGrant {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.accountId === 'string' &&
    typeof g.username === 'string' &&
    isServiceTier(g.tier) &&
    typeof g.grantedBy === 'string' &&
    typeof g.grantedAt === 'string'
  );
}
