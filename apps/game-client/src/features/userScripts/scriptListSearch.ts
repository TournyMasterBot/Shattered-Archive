// apps\game-client\src\features\userScripts\scriptListSearch.ts
import { AnyUserScript, AliasScript, TimerScript, TriggerScript } from './types';

export type ScriptSearchTag =
  | 'kind'
  | 'name'
  | 'id'
  | 'language'
  | 'enabled'
  | 'disabled'
  | 'event'
  | 'match'
  | 'alias'
  | 'interval'
  | 'group';

export interface ParsedSearchTerm {
  raw: string;
  tag?: ScriptSearchTag;
  value: string;
}

export interface TriggerTreeNode {
  key: string;
  label: string;
  path: string;
  children: TriggerTreeNode[];
  scripts: TriggerScript[];
}

interface MutableTriggerTreeNode {
  key: string;
  label: string;
  path: string;
  children: MutableTriggerTreeNode[];
  scripts: TriggerScript[];
  _childMap: Map<string, MutableTriggerTreeNode>;
}

function normalize(v: unknown): string {
  return String(v ?? '').toLowerCase();
}

function splitSearchQuery(query: string): string[] {
  return (query ?? '')
    .trim()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseScriptSearchQuery(query: string): ParsedSearchTerm[] {
  const parts = splitSearchQuery(query);

  return parts.map((raw) => {
    const idx = raw.indexOf(':');
    if (idx <= 0) {
      return { raw, value: normalize(raw) };
    }

    const maybeTag = normalize(raw.slice(0, idx));
    const value = normalize(raw.slice(idx + 1));

    const validTags: ScriptSearchTag[] = [
      'kind',
      'name',
      'id',
      'language',
      'enabled',
      'disabled',
      'event',
      'match',
      'alias',
      'interval',
      'group',
    ];

    if (!validTags.includes(maybeTag as ScriptSearchTag)) {
      return { raw, value: normalize(raw) };
    }

    return {
      raw,
      tag: maybeTag as ScriptSearchTag,
      value,
    };
  });
}

function buildScriptSearchFields(script: AnyUserScript): Record<string, string> {
  const base: Record<string, string> = {
    kind: normalize(script.kind),
    name: normalize(script.name),
    id: normalize(script.id),
    language: normalize(script.language),
    enabled: script.enabled ? 'true yes on enabled' : 'false no off',
    disabled: script.enabled ? '' : 'true yes disabled off',
    _all: normalize(`${script.kind} ${script.name} ${script.id} ${script.language}`),
  };

  if (script.kind === 'trigger') {
    const t = script as TriggerScript;
    base.event = normalize(t.eventName);
    base.match = normalize(t.matchText);
    base.group = normalize(t.group ?? '');
    base._all = normalize(`${base._all} ${t.eventName} ${t.matchText} ${t.group ?? ''}`);
  } else if (script.kind === 'alias') {
    const a = script as AliasScript;
    base.alias = normalize(a.alias);
    base._all = normalize(`${base._all} ${a.alias}`);
  } else if (script.kind === 'timer') {
    const tm = script as TimerScript;
    base.interval = normalize(String(tm.intervalMs));
    base._all = normalize(`${base._all} ${tm.intervalMs}`);
  }

  return base;
}

function matchesTaggedTerm(script: AnyUserScript, term: ParsedSearchTerm): boolean {
  const fields = buildScriptSearchFields(script);

  if (!term.tag) {
    return fields._all.includes(term.value);
  }

  if (term.tag === 'enabled') {
    if (!term.value) return script.enabled === true;
    const wantsEnabled = ['1', 'true', 'yes', 'on', 'enabled'].includes(term.value);
    return wantsEnabled ? script.enabled === true : script.enabled === false;
  }

  if (term.tag === 'disabled') {
    if (!term.value) return script.enabled === false;
    const wantsDisabled = ['1', 'true', 'yes', 'on', 'disabled'].includes(term.value);
    return wantsDisabled ? script.enabled === false : script.enabled === true;
  }

  const fieldVal = fields[term.tag] ?? '';
  return fieldVal.includes(term.value);
}

export function filterScriptsByTagQuery<T extends AnyUserScript>(scripts: T[], query: string): T[] {
  const terms = parseScriptSearchQuery(query);
  if (terms.length === 0) return scripts;

  return scripts.filter((script) => terms.every((term) => matchesTaggedTerm(script, term)));
}

/**
 * Groups triggers by explicit trigger.group path using delimiters:
 * "/", "\", ">", "::"
 *
 * Empty/missing group goes to "Ungrouped".
 */
export function buildTriggerTree(triggers: TriggerScript[]): TriggerTreeNode[] {
  const makeNode = (label: string, path: string): MutableTriggerTreeNode => ({
    key: path || label,
    label,
    path,
    children: [],
    scripts: [],
    _childMap: new Map<string, MutableTriggerTreeNode>(),
  });

  const root = makeNode('__root__', '');

  const splitGroupPath = (group?: string): string[] => {
    const cleaned = (group ?? '').trim();
    if (!cleaned) return ['Ungrouped'];

    const parts = cleaned
      .replace(/::/g, '/')
      .replace(/\\/g, '/')
      .replace(/\s*>\s*/g, '/')
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);

    return parts.length ? parts : ['Ungrouped'];
  };

  const sorted = [...triggers].sort((a, b) => a.name.localeCompare(b.name));

  for (const trigger of sorted) {
    const groupParts = splitGroupPath(trigger.group);
    let cursor = root;

    for (const part of groupParts) {
      const nextPath = cursor.path ? `${cursor.path}/${part}` : part;
      let child = cursor._childMap.get(part);
      if (!child) {
        child = makeNode(part, nextPath);
        cursor._childMap.set(part, child);
        cursor.children.push(child);
      }
      cursor = child;
    }

    cursor.scripts.push(trigger);
  }

  const finalize = (node: MutableTriggerTreeNode): TriggerTreeNode => ({
    key: node.key,
    label: node.label,
    path: node.path,
    children: [...node.children].sort((a, b) => a.label.localeCompare(b.label)).map(finalize),
    scripts: [...node.scripts].sort((a, b) => a.name.localeCompare(b.name)),
  });

  return root.children.map(finalize);
}