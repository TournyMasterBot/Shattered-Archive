// apps/game-client/src/features/library/org-content-types.ts
// Organizations Phase 2 Step 5 — types for the game-client Organizations tab.
// Wire shapes verified directly against DSL/Server (OrganizationController.cs,
// OrganizationContentController.cs, CharacterController.cs) rather than assumed —
// notably: org content items have NO server-guaranteed createdAt/updatedAt (the
// content controller stores whatever JSON body the client sends, stamping only
// id/authorCharacterId/authorCharacterName itself), and title is optional
// (validators never require it).

export type OrgRole = 'member' | 'moderator' | 'leader';

const ROLE_RANK: Record<OrgRole, number> = { member: 1, moderator: 2, leader: 3 };

export function orgRoleAtLeast(role: OrgRole | null | undefined, minimum: OrgRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export interface OrgCharacter {
  id: string;
  accountId: string;
  name: string;
  createdAt: string;
}

// GET /library/organizations — one row per standing (a character membership AND
// an account-level grant in the same org both appear, matching the backend's own
// "one row per standing, not per org" shape — see organizations.js's
// groupedMyOrgs() on the web dashboard for the same dedup concern, not replicated
// here since Step 5 has no equivalent "my orgs" combined list view).
export interface OrgSummary {
  id: string;
  name: string;
  categorySlug: string;
  characterId?: string;
  characterName?: string;
  role: OrgRole;
  viaAccountRole?: boolean;
}

export interface OrgCharacterMembership {
  characterId: string;
  characterName: string;
  role: OrgRole;
}

// GET /library/organizations/{orgId}
export interface OrgDetail {
  id: string;
  name: string;
  categorySlug: string;
  createdAt: string;
  currentEpoch: number;
  myCharacterMemberships: OrgCharacterMembership[];
  myAccountRole?: OrgRole;
  viaServiceAdminOverride?: boolean;
}

export type OrgContentType = 'parchment' | 'notes' | 'books';

export const ORG_NOTE_SPOOLS = ['note', 'anote', 'storynote', 'oocn', 'qnote', 'history', 'news', 'changes'] as const;
export type OrgNoteSpool = (typeof ORG_NOTE_SPOOLS)[number];

export interface OrgBookPage {
  page: number;
  body: string;
}

// One shape covers all three content types (server stores an unstructured JSON
// object per item) — spool/pages are only ever populated for notes/books
// respectively, body is used by parchment and notes (and books as a flat-body
// fallback, per the Step 4 finding that OrgAuthoredBookModel's pages array is
// optional).
export interface OrgContentItem {
  id: string;
  title?: string;
  categoryPath?: string[];
  body?: string;
  spool?: OrgNoteSpool;
  pages?: OrgBookPage[];
  authorCharacterId?: string;
  authorCharacterName?: string;
}

export const MAX_CATEGORY_DEPTH = 5;
export const MAX_CATEGORY_SEGMENT_CHARS = 60;
export const MAX_BODY_CHARS = 20000;

const UNCATEGORIZED = 'Uncategorized';

export interface CategoryTreeNode {
  segment: string;
  depth: number; // 0-based; the synthetic root itself is depth -1 and never rendered
  children: Map<string, CategoryTreeNode>;
  items: OrgContentItem[];
}

/** Builds an N-level tree (N = MAX_CATEGORY_DEPTH) from a flat item list's categoryPath arrays. */
export function buildCategoryTree(items: OrgContentItem[]): CategoryTreeNode {
  const root: CategoryTreeNode = { segment: '', depth: -1, children: new Map(), items: [] };
  for (const item of items) {
    const path = item.categoryPath && item.categoryPath.length > 0 ? item.categoryPath : [UNCATEGORIZED];
    let node = root;
    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, depth: i, children: new Map(), items: [] };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.items.push(item);
  }
  return root;
}

function itemLabel(item: OrgContentItem): string {
  return item.title?.trim() || item.id;
}

/** Children sorted alphabetically, with the synthetic "Uncategorized" bucket always last. */
export function sortedChildren(node: CategoryTreeNode): CategoryTreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.segment === UNCATEGORIZED) return 1;
    if (b.segment === UNCATEGORIZED) return -1;
    return a.segment.localeCompare(b.segment, undefined, { sensitivity: 'base' });
  });
}

export function sortedItems(items: OrgContentItem[]): OrgContentItem[] {
  return [...items].sort((a, b) => itemLabel(a).localeCompare(itemLabel(b), undefined, { sensitivity: 'base' }));
}
