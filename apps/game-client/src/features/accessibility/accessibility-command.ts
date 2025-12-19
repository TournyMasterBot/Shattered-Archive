import { getAccessibilitySettings } from './accessibility-settings-store';

function startsWithPrefix(s: string, prefix: string) {
  if (!prefix) return false;
  return s.startsWith(prefix);
}

function parseRepeatCount(s: string): { count: number; rest: string } {
  let i = 0;
  while (i < s.length && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) i++;
  const n = i > 0 ? Number(s.slice(0, i)) : NaN;
  const rest = s.slice(i).trimStart();
  return { count: Number.isFinite(n) && n > 0 ? n : 1, rest };
}

function oneChar(s: string): string {
  const v = (s ?? '').trim();
  return v ? v.slice(0, 1) : '';
}

function capCount(n: number) {
  return Math.max(1, Math.min(50, n));
}

function splitKeepEmpty(input: string, splitChar: string): string[] {
  const ch = oneChar(splitChar);
  return ch ? input.split(ch) : [input];
}

export type AccessibilityCommandAction =
  | { kind: 'send'; lines: string[]; keepInputAfterSend: boolean; flushQueue?: boolean }
  | { kind: 'noop'; keepInputAfterSend: boolean };

export function preprocessOutgoingCommand(rawInput: string, history: string[]): AccessibilityCommandAction {
  const settings = getAccessibilitySettings();
  const keep = !!settings.keepInputAfterSend;

  const input = rawInput ?? '';

  if (!settings.enableLocalPrefixes) {
    return { kind: 'send', lines: splitKeepEmpty(input, settings.commandSplitChar), keepInputAfterSend: keep };
  }

  // 1) Clear stack key: "~who" => send "~" then send "who" normally (split-aware)
  if (startsWithPrefix(input, settings.clearStackKey)) {
    const suffix = input.slice(settings.clearStackKey.length); // DO NOT trim
    const lines: string[] = [settings.clearStackCommand];

    if (suffix.length > 0) {
      lines.push(...splitKeepEmpty(suffix, settings.commandSplitChar));
    }

    // IMPORTANT: clear must also flush pending outbound jobs
    return { kind: 'send', lines, keepInputAfterSend: keep, flushQueue: true };
  }

  // 2) Repeat-chain: "&10kill mel;where" => repeat the chain 10 times (and split it)
  if (startsWithPrefix(input, settings.repeatLastPrefix)) {
    const suffix = input.slice(settings.repeatLastPrefix.length).trimStart();
    if (!suffix) return { kind: 'noop', keepInputAfterSend: keep };

    const { count, rest } = parseRepeatCount(suffix);
    const chainText = rest.length > 0 ? rest : suffix;

    const chain = splitKeepEmpty(chainText, settings.commandSplitChar);
    const safe = capCount(count);

    const lines: string[] = [];
    for (let i = 0; i < safe; i++) {
      for (const c of chain) lines.push(c);
    }

    return { kind: 'send', lines, keepInputAfterSend: keep };
  }

  // 3) Repeater: "#5n;5e;..." => each segment independently repeated, in order
  if (startsWithPrefix(input, settings.repeaterPrefix)) {
    const suffix = input.slice(settings.repeaterPrefix.length); // DO NOT trim
    const segments = splitKeepEmpty(suffix, settings.commandSplitChar);

    const lines: string[] = [];

    for (const seg of segments) {
      const trimmed = seg.trimStart();

      // preserve empty segments (blank sends should still go through)
      if (trimmed.length === 0) {
        lines.push(seg);
        continue;
      }

      const { count, rest } = parseRepeatCount(trimmed);
      const cmd = rest.length > 0 ? rest : trimmed;

      const safe = capCount(count);
      for (let i = 0; i < safe; i++) lines.push(cmd);
    }

    if (lines.length === 0) return { kind: 'noop', keepInputAfterSend: keep };
    return { kind: 'send', lines, keepInputAfterSend: keep };
  }

  // default: normal splitting
  return { kind: 'send', lines: splitKeepEmpty(input, settings.commandSplitChar), keepInputAfterSend: keep };
}
