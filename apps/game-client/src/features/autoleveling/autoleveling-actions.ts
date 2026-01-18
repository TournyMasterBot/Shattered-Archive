// apps/game-client/src/features/autoleveling/autoleveling-actions.ts

/**
 * Action Editor Parser/Serializer
 * -------------------------------
 * Intent:
 * - Allow "one line per action" editing in the UI.
 * - Parser rules:
 *    wait_ms <number>
 *    wait_text <text...>        (case-insensitive by default)
 *    wait_regex <pattern>       supports /pattern/flags or raw pattern
 *    wait_fighting <bool> [ms]  optionally add timeout
 *    otherwise: send <raw line> (blank lines are preserved as send:"")
 *
 * NOTE:
 * - Preserving blank lines matches your earlier runner philosophy (empty segments still dispatched).
 */

import type { AutoLevelAction } from './autoleveling-types';

/* ----------------------------- debug helpers ------------------------------ */

const ACTIONS_LOG_PREFIX = '[autoleveling][actions]';

function isAutoLevelingDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__AUTOLEVELING_DEBUG__ === true) return true;

    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('autoleveling.debug') : null;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;

    try {
      const dev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
      return dev;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function adbg(...args: any[]) {
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(ACTIONS_LOG_PREFIX, ...args);
}

/* ------------------------------------------------------------------------- */

function toLines(text: string): string[] {
  return (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function parseActionsFromEditor(text: string): AutoLevelAction[] {
  const lines = toLines(text);

  //adbg('parseActionsFromEditor', { lines: lines.length });

  const out: AutoLevelAction[] = [];
  for (const raw of lines) {
    const line = raw ?? '';
    const trimmed = line.trim();

    if (trimmed.toLowerCase().startsWith('wait_fighting ')) {
      const rest = trimmed.slice('wait_fighting '.length).trim();
      const parts = rest.split(/\s+/g).filter(Boolean);
      const vRaw = (parts[0] ?? '').toLowerCase();
      const value = vRaw === 'true' || vRaw === '1' || vRaw === 'yes';
      const tRaw = parts[1];
      const timeoutMs = tRaw != null ? Number(tRaw) : undefined;
      out.push({
        kind: 'wait_fighting',
        value,
        timeoutMs: Number.isFinite(timeoutMs as any) ? Math.max(0, Math.floor(timeoutMs as any)) : undefined,
      });
      continue;
    }

    if (trimmed.toLowerCase().startsWith('wait_ms ')) {
      const n = Number(trimmed.slice('wait_ms '.length).trim());
      out.push({ kind: 'wait_ms', ms: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0 });
      continue;
    }

    if (trimmed.toLowerCase().startsWith('wait_text ')) {
      const rest = trimmed.slice('wait_text '.length);
      out.push({ kind: 'wait_text', text: rest, caseInsensitive: true });
      continue;
    }

    if (trimmed.toLowerCase().startsWith('wait_regex ')) {
      const rest = trimmed.slice('wait_regex '.length).trim();

      // supports: /pattern/flags OR raw pattern
      if (rest.startsWith('/') && rest.lastIndexOf('/') > 0) {
        const last = rest.lastIndexOf('/');
        const pattern = rest.slice(1, last);
        const flags = rest.slice(last + 1) || 'i';
        out.push({ kind: 'wait_regex', pattern, flags });
      } else {
        out.push({ kind: 'wait_regex', pattern: rest, flags: 'i' });
      }
      continue;
    }

    // Preserve blank lines as blank sends
    out.push({ kind: 'send', cmd: line });
  }

  //adbg('parseActionsFromEditor done', { actions: out.length });
  return out;
}

export function serializeActionsToEditor(actions: AutoLevelAction[]): string {
  const lines: string[] = [];

  for (const a of actions ?? []) {
    if (a.kind === 'send') lines.push(a.cmd ?? '');
    else if (a.kind === 'wait_fighting') {
      const base = `wait_fighting ${a.value ? 'true' : 'false'}`;
      lines.push(a.timeoutMs != null ? `${base} ${a.timeoutMs}` : base);
    } else if (a.kind === 'wait_ms') lines.push(`wait_ms ${a.ms}`);
    else if (a.kind === 'wait_text') lines.push(`wait_text ${a.text ?? ''}`);
    else if (a.kind === 'wait_regex') lines.push(`wait_regex /${a.pattern ?? ''}/${a.flags ?? 'i'}`);
  }

  const out = lines.join('\n');
  //adbg('serializeActionsToEditor', { actions: actions?.length ?? 0, lines: lines.length, chars: out.length });
  return out;
}
