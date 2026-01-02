import type { AutoLevelAction } from './autoleveling-types';

function toLines(text: string): string[] {
  return (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function parseActionsFromEditor(text: string): AutoLevelAction[] {
  const lines = toLines(text);

  const out: AutoLevelAction[] = [];
  for (const raw of lines) {
    const line = raw ?? '';

    const trimmed = line.trim();

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

    // Preserve blank lines as blank sends (same philosophy as your text runner)
    out.push({ kind: 'send', cmd: line });
  }

  return out;
}

export function serializeActionsToEditor(actions: AutoLevelAction[]): string {
  const lines: string[] = [];

  for (const a of actions ?? []) {
    if (a.kind === 'send') lines.push(a.cmd ?? '');
    else if (a.kind === 'wait_ms') lines.push(`wait_ms ${a.ms}`);
    else if (a.kind === 'wait_text') lines.push(`wait_text ${a.text ?? ''}`);
    else if (a.kind === 'wait_regex') lines.push(`wait_regex /${a.pattern ?? ''}/${a.flags ?? 'i'}`);
  }

  return lines.join('\n');
}
