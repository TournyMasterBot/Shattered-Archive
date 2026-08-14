// apps/game-client/src/components/OrganizationsPane.tsx
// Organizations Phase 2 Step 5 — game-client's Organizations tab, extracted into
// its own component rather than folded into LibraryModal.tsx's already-dense
// tab={'x'} ternary chains (that file is 1700+ lines; every existing tab's
// save/delete/new/dirty-guard logic already threads one branch per tab through
// several functions — a 4th, structurally different branch (multi-org,
// role-gated, N-level category tree, no IndexedDB mirror) was worth keeping
// separate rather than growing that pattern further). Reuses LibraryModal's own
// style module throughout (existing precedent for this: CompassBlockMobile,
// MiscPane, PluginsPage all import a sibling component's .module.scss instead of
// duplicating shared primitives into their own).
//
// Deliberately out of scope here (web-dashboard-only, per the Organizations
// Phase 2 plan doc's explicit constraint): revision history/revert, audit log,
// invites/requests, member/role/ban management, org creation. This pane only
// browses and edits content within organizations the player already belongs to
// — org membership itself is still managed on the website.

import React from 'react';
import styles from '../styles/LibraryModal.module.scss';
import { getToken, isExpired, subscribeToToken } from '../features/auth/authTokenStore';
import {
  listMyOrganizations,
  getOrganization,
  listOrgContent,
  saveOrgContent,
  deleteOrgContent,
} from '../features/library/org-content';
import {
  orgRoleAtLeast,
  buildCategoryTree,
  sortedChildren,
  sortedItems,
  ORG_NOTE_SPOOLS,
  MAX_CATEGORY_DEPTH,
  MAX_BODY_CHARS,
} from '../features/library/org-content-types';
import type {
  OrgRole,
  OrgSummary,
  OrgDetail,
  OrgContentType,
  OrgContentItem,
  OrgNoteSpool,
  CategoryTreeNode,
} from '../features/library/org-content-types';
import { getLineStats, getWarnings } from '../features/library/library-types';
import { renderDslToHtml } from '../features/library/renderDslColorPreviewHtml';

const ADMIN_CAPACITY = '__admin__';

const CONTENT_TYPES: Array<{ id: OrgContentType; label: string }> = [
  { id: 'parchment', label: 'Parchment' },
  { id: 'notes', label: 'Notes' },
  { id: 'books', label: 'Books' },
];

function resolveActingCharacterId(acting: string): string | null {
  return acting && acting !== ADMIN_CAPACITY ? acting : null;
}

function itemLabel(item: OrgContentItem): string {
  return item.title?.trim() || '(untitled)';
}

interface CategoryNodeViewProps {
  node: CategoryTreeNode;
  selectedItemId: string | null;
  onSelectItem: (item: OrgContentItem) => void;
}

const CategoryNodeView: React.FC<CategoryNodeViewProps> = ({ node, selectedItemId, onSelectItem }) => {
  return (
    <>
      {node.segment !== '' && (
        <div
          className={`${styles.orgTreeGroupHeader} ${node.depth === 0 ? styles.orgTreeGroupHeaderTop : ''}`}
          style={{ paddingLeft: 10 + node.depth * 14 }}
        >
          {node.segment}
        </div>
      )}

      {sortedItems(node.items).map((item) => (
        <button
          type="button"
          key={item.id}
          className={`${styles.listItem} ${selectedItemId === item.id ? styles.listItemActive : ''}`}
          onClick={() => onSelectItem(item)}
        >
          <div className={styles.listItemTitle}>{itemLabel(item)}</div>
          {item.authorCharacterName ? <div className={styles.listItemMeta}>by {item.authorCharacterName}</div> : null}
        </button>
      ))}

      {sortedChildren(node).map((child) => (
        <CategoryNodeView key={child.segment} node={child} selectedItemId={selectedItemId} onSelectItem={onSelectItem} />
      ))}
    </>
  );
};

const OrganizationsPane: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  const [orgs, setOrgs] = React.useState<OrgSummary[]>([]);
  const [orgsError, setOrgsError] = React.useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = React.useState<string | null>(null);

  const [orgDetail, setOrgDetail] = React.useState<OrgDetail | null>(null);
  const [orgDetailError, setOrgDetailError] = React.useState<string | null>(null);
  const [actingCharacterId, setActingCharacterId] = React.useState<string>('');

  const [contentType, setContentType] = React.useState<OrgContentType>('parchment');
  const [items, setItems] = React.useState<OrgContentItem[]>([]);
  const [itemsLoading, setItemsLoading] = React.useState(false);
  const [itemsError, setItemsError] = React.useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);

  const [draftTitle, setDraftTitle] = React.useState('');
  const [draftCategoryPath, setDraftCategoryPath] = React.useState('');
  const [draftBody, setDraftBody] = React.useState('');
  const [draftSpool, setDraftSpool] = React.useState<OrgNoteSpool>('note');
  const [bodyCursorPos, setBodyCursorPos] = React.useState(0);

  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ text: string; err: boolean } | null>(null);

  // ---------------------------------------------------------------- auth
  React.useEffect(() => {
    const stored = getToken();
    setIsLoggedIn(!!stored && !isExpired(stored));
  }, []);
  React.useEffect(() => subscribeToToken((stored) => setIsLoggedIn(!!stored && !isExpired(stored))), []);

  // ---------------------------------------------------------------- orgs
  React.useEffect(() => {
    if (!isLoggedIn) {
      setOrgs([]);
      return;
    }
    let cancelled = false;
    listMyOrganizations().then((res) => {
      if (cancelled) return;
      if (res.kind === 'ok') {
        setOrgs(res.data);
        setOrgsError(null);
      } else if (res.kind === 'error') {
        setOrgs([]);
        setOrgsError(res.message);
      } else {
        setOrgs([]);
        setOrgsError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const uniqueOrgs = React.useMemo(() => {
    const seen = new Map<string, OrgSummary>();
    for (const o of orgs) if (!seen.has(o.id)) seen.set(o.id, o);
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [orgs]);

  React.useEffect(() => {
    if (selectedOrgId) return;
    if (uniqueOrgs.length > 0) setSelectedOrgId(uniqueOrgs[0].id);
  }, [uniqueOrgs, selectedOrgId]);

  // ---------------------------------------------------------------- org detail + acting-as
  React.useEffect(() => {
    if (!selectedOrgId) {
      setOrgDetail(null);
      return;
    }
    let cancelled = false;
    getOrganization(selectedOrgId).then((res) => {
      if (cancelled) return;
      if (res.kind === 'ok') {
        setOrgDetail(res.data);
        setOrgDetailError(null);
      } else if (res.kind === 'error') {
        setOrgDetail(null);
        setOrgDetailError(res.message);
      } else {
        setOrgDetail(null);
        setOrgDetailError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedOrgId]);

  const actingOptions = React.useMemo(() => {
    if (!orgDetail) return [] as Array<{ value: string; label: string }>;
    const opts = orgDetail.myCharacterMemberships.map((m) => ({ value: m.characterId, label: `${m.characterName} (${m.role})` }));
    if (orgDetail.myAccountRole || orgDetail.viaServiceAdminOverride) {
      opts.push({
        value: ADMIN_CAPACITY,
        label: `Administrative capacity${orgDetail.myAccountRole ? ` (${orgDetail.myAccountRole})` : ''}`,
      });
    }
    return opts;
  }, [orgDetail]);

  // Reset the acting-as pick only when the ORG changes (org detail's identity),
  // not on every re-fetch of the same org (e.g. after a save) — that would
  // silently discard the user's deliberate acting-as choice mid-session.
  React.useEffect(() => {
    if (!orgDetail) {
      setActingCharacterId('');
      return;
    }
    if (orgDetail.myCharacterMemberships.length > 0) {
      setActingCharacterId(orgDetail.myCharacterMemberships[0].characterId);
    } else if (orgDetail.myAccountRole || orgDetail.viaServiceAdminOverride) {
      setActingCharacterId(ADMIN_CAPACITY);
    } else {
      setActingCharacterId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgDetail?.id]);

  const myRole: OrgRole | null = React.useMemo(() => {
    if (!orgDetail) return null;
    if (actingCharacterId && actingCharacterId !== ADMIN_CAPACITY) {
      return orgDetail.myCharacterMemberships.find((m) => m.characterId === actingCharacterId)?.role ?? null;
    }
    if (actingCharacterId === ADMIN_CAPACITY) {
      return orgDetail.myAccountRole ?? (orgDetail.viaServiceAdminOverride ? 'leader' : null);
    }
    return null;
  }, [orgDetail, actingCharacterId]);

  const canWrite = orgRoleAtLeast(myRole, 'moderator');

  // ---------------------------------------------------------------- content items
  const refreshItems = React.useCallback(() => {
    if (!selectedOrgId) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    listOrgContent(selectedOrgId, contentType).then((res) => {
      setItemsLoading(false);
      if (res.kind === 'ok') {
        setItems(res.data);
        setItemsError(null);
      } else if (res.kind === 'error') {
        setItems([]);
        setItemsError(res.message);
      } else {
        setItems([]);
        setItemsError(null);
      }
    });
  }, [selectedOrgId, contentType]);

  React.useEffect(() => {
    refreshItems();
    setSelectedItemId(null);
    setDraftTitle('');
    setDraftCategoryPath('');
    setDraftBody('');
    setDraftSpool('note');
    setStatus(null);
  }, [refreshItems]);

  const categoryTree = React.useMemo(() => buildCategoryTree(items), [items]);

  const handleSelectItem = (item: OrgContentItem) => {
    setSelectedItemId(item.id);
    setDraftTitle(item.title ?? '');
    setDraftCategoryPath((item.categoryPath ?? []).join(', '));
    setDraftBody(item.body ?? '');
    setDraftSpool((item.spool as OrgNoteSpool | undefined) ?? 'note');
    setStatus(null);
  };

  const handleNewItem = () => {
    setSelectedItemId(null);
    setDraftTitle('');
    setDraftCategoryPath('');
    setDraftBody('');
    setDraftSpool('note');
    setStatus(null);
  };

  const handleSave = async () => {
    if (!selectedOrgId) return;
    if (!canWrite) {
      setStatus({ text: 'The acting character (or capacity) must be Moderator or Leader to save.', err: true });
      return;
    }
    const categoryPath = draftCategoryPath
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX_CATEGORY_DEPTH);

    const id =
      selectedItemId ??
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `org-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    setSaving(true);
    setStatus(null);
    const res = await saveOrgContent(
      selectedOrgId,
      contentType,
      id,
      {
        title: draftTitle.trim() || undefined,
        categoryPath: categoryPath.length > 0 ? categoryPath : undefined,
        body: draftBody,
        ...(contentType === 'notes' ? { spool: draftSpool } : {}),
      },
      resolveActingCharacterId(actingCharacterId),
    );
    setSaving(false);

    if (res.kind === 'ok') {
      setStatus({ text: 'Saved.', err: false });
      setSelectedItemId(id);
      refreshItems();
    } else if (res.kind === 'unauthenticated') {
      setStatus({ text: 'Your session expired — log in again.', err: true });
    } else {
      setStatus({ text: res.message, err: true });
    }
  };

  const handleDelete = async () => {
    if (!selectedOrgId || !selectedItemId) return;
    if (!canWrite) {
      setStatus({ text: 'The acting character (or capacity) must be Moderator or Leader to delete.', err: true });
      return;
    }
    if (!window.confirm(`Delete "${itemLabel({ id: selectedItemId, title: draftTitle })}"?\n\nThis cannot be undone.`)) return;

    setSaving(true);
    const res = await deleteOrgContent(selectedOrgId, contentType, selectedItemId, resolveActingCharacterId(actingCharacterId));
    setSaving(false);

    if (res.kind === 'ok') {
      setStatus({ text: 'Deleted.', err: false });
      handleNewItem();
      refreshItems();
    } else if (res.kind === 'unauthenticated') {
      setStatus({ text: 'Your session expired — log in again.', err: true });
    } else {
      setStatus({ text: res.message, err: true });
    }
  };

  const bodyStats = React.useMemo(() => getLineStats(draftBody, bodyCursorPos), [draftBody, bodyCursorPos]);
  const bodyWarnings = React.useMemo(() => getWarnings(bodyStats), [bodyStats]);
  const previewHtml = React.useMemo(() => renderDslToHtml(draftBody), [draftBody]);

  // ---------------------------------------------------------------- render
  if (!isLoggedIn) {
    return <div className={styles.orgEmptyState}>Log in to view and manage your organizations.</div>;
  }

  if (uniqueOrgs.length === 0) {
    return (
      <div className={styles.orgEmptyState}>
        {orgsError
          ? `Couldn't load your organizations: ${orgsError}`
          : "You're not part of any organization yet. Join or create one from the website's Library → Organizations page."}
      </div>
    );
  }

  return (
    <div className={styles.split}>
      <div className={styles.orgTopBar}>
        <div className={styles.scribeField}>
          <div className={styles.scribeFieldLabel}>Organization</div>
          <div className={styles.scribeSelectWrap}>
            <select
              className={styles.scribeSelect}
              value={selectedOrgId ?? ''}
              onChange={(e) => setSelectedOrgId(e.target.value || null)}
            >
              {uniqueOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.scribeField}>
          <div className={styles.scribeFieldLabel}>Acting as</div>
          <div className={styles.scribeSelectWrap}>
            <select className={styles.scribeSelect} value={actingCharacterId} onChange={(e) => setActingCharacterId(e.target.value)}>
              {actingOptions.length === 0 ? <option value="">(read-only — no writable standing)</option> : null}
              {actingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {myRole ? <div className={styles.orgRoleBadge}>{myRole}</div> : null}

        <div className={styles.orgContentTypeTabs}>
          {CONTENT_TYPES.map((ct) => (
            <button
              type="button"
              key={ct.id}
              className={`${styles.tabButton} ${contentType === ct.id ? styles.tabButtonActive : ''}`}
              onClick={() => setContentType(ct.id)}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </div>

      {orgDetailError ? <div className={`${styles.orgStatus} ${styles.orgStatusErr}`}>{orgDetailError}</div> : null}

      <div className={styles.splitHeader}>
        <div className={styles.listHeader}>
          <div className={styles.listTitle}>Content</div>
          <button type="button" className={styles.secondaryButton} onClick={handleNewItem}>
            + New
          </button>
        </div>

        <div className={styles.editorHeader}>
          {contentType === 'notes' ? (
            <div className={styles.titleWithSpool}>
              <div className={styles.noteSpoolSelectWrap}>
                <select
                  className={styles.noteSpoolSelect}
                  value={draftSpool}
                  onChange={(e) => setDraftSpool(e.target.value as OrgNoteSpool)}
                  aria-label="Note spool"
                >
                  {ORG_NOTE_SPOOLS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <input className={styles.titleInput} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Title" />
            </div>
          ) : (
            <input className={styles.titleInput} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Title" />
          )}

          <div className={styles.headerSpacer} />

          <div className={styles.editorButtons}>
            <button type="button" className={styles.secondaryButton} onClick={handleSave} disabled={saving || !canWrite}>
              Save
            </button>
            <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={saving || !canWrite || !selectedItemId}>
              Delete
            </button>
          </div>
        </div>

        <div className={styles.tagRow}>
          <input
            className={styles.tagInput}
            value={draftCategoryPath}
            onChange={(e) => setDraftCategoryPath(e.target.value)}
            placeholder={`Folder path, comma separated (e.g. Recruitment, Flyers — up to ${MAX_CATEGORY_DEPTH} levels)`}
            disabled={!canWrite}
          />
        </div>

        {status ? <div className={`${styles.orgStatus} ${status.err ? styles.orgStatusErr : ''}`}>{status.text}</div> : null}
      </div>

      <div className={styles.splitBody}>
        <div className={styles.listPane}>
          <div className={styles.list}>
            {itemsLoading ? (
              <div className={styles.orgEmptyState}>Loading…</div>
            ) : itemsError ? (
              <div className={styles.orgEmptyState}>{itemsError}</div>
            ) : items.length === 0 ? (
              <div className={styles.orgEmptyState}>Nothing here yet.</div>
            ) : (
              <CategoryNodeView node={categoryTree} selectedItemId={selectedItemId} onSelectItem={handleSelectItem} />
            )}
          </div>
        </div>

        <div className={styles.editorPane}>
          <div className={styles.editorMain}>
            <div className={styles.editorGrid}>
              <textarea
                className={styles.textArea}
                value={draftBody}
                readOnly={!canWrite}
                onChange={(e) => {
                  setDraftBody(e.target.value);
                  setBodyCursorPos(e.target.selectionStart ?? e.target.value.length);
                }}
                onSelect={(e) => setBodyCursorPos(e.currentTarget.selectionStart ?? 0)}
                placeholder={canWrite ? 'Write here…' : 'You need Moderator or Leader to edit this.'}
                maxLength={MAX_BODY_CHARS}
              />

              <div className={styles.previewPane}>
                <div className={styles.previewTitle}>Preview</div>
                <div className={styles.previewBody}>
                  <div className={styles.previewInner} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </div>

            <div
              className={`${styles.bodyStats} ${
                bodyWarnings.lineCountLevel === 'over' || bodyWarnings.charLengthLevel === 'over'
                  ? styles.bodyStatsOver
                  : bodyWarnings.lineCountLevel === 'warn' || bodyWarnings.charLengthLevel === 'warn'
                    ? styles.bodyStatsWarn
                    : ''
              }`}
            >
              {bodyStats.lineCount} line{bodyStats.lineCount === 1 ? '' : 's'}, line {bodyStats.currentLineIndex + 1} is{' '}
              {bodyStats.currentLineLength} char{bodyStats.currentLineLength === 1 ? '' : 's'} long
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizationsPane;
