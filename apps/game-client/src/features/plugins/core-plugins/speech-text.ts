// apps/game-client/src/features/plugins/core-plugins/speech-text.ts
//
// Sanitizer for text on its way to a speech engine.
//
// The stripAnsi helpers used elsewhere in the client only remove SGR color
// runs (ESC [ ... m), because that is all their callers — line matching,
// equipment parsing — ever needed. Speech is stricter: anything else the wire
// carries (cursor moves, erase-line, screen clears, private-mode toggles like
// ESC [ ? 25 l, an OSC title string, a stray control byte) survived that
// pattern and got handed to the synthesizer verbatim, which happily reads the
// digits and letters out loud.
//
// This is deliberately applied at the utterance boundary rather than at each
// call site, so every path into the speech queue — raw play-area lines,
// GMCP-derived alerts, the read-selected-text button, text another plugin
// echoed back into the stream — is covered by construction.
//
// The byte ranges are written as \x escapes rather than as literal character
// ranges (`[ -/]`) because several of the characters involved — '/', '\', ']'
// — are hard to read inside a regex character class.

// OSC (ESC ] ... BEL / ST) first: its introducer is also matched by
// ESC_SHORT_RE below. The trailing `$` alternative catches an OSC left
// unterminated at the end of a chunk.
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/g;

// Full CSI: parameter bytes, then intermediate bytes, then ANY final byte —
// not just 'm'. The parameter range includes '?', which the SGR-only patterns
// never allowed for.
const CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;

// A sequence cut in half by a chunk boundary leaves this tail behind. Only the
// trailing half is safely removable — the matching head that lands at the
// start of the NEXT chunk ("7m") is indistinguishable from real text without
// carrying state across events, which is not worth it for a case the wire
// format makes rare.
const DANGLING_ESC_RE = /\x1b(?:\[[\x30-\x3f]*[\x20-\x2f]*)?$/;

// Two-character escapes: ESC M, charset selects (ESC ( B), and the rest of the
// Fe/Fs set. '[' (\x5b) is excluded from the range so this can never eat a CSI
// introducer out from under the patterns above.
const ESC_SHORT_RE = /\x1b[()][0-9A-Za-z]|\x1b[\x40-\x5a\x5c-\x5f]/g;

// Leftover non-printing bytes: SOH section markers, BEL, a bare ESC. Tab,
// newline and carriage return are kept — callers still split and trim on them.
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const HAS_CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Strips terminal escape sequences and non-printing control bytes from text
 * that is about to be spoken. Whitespace, including newlines, is preserved so
 * callers can still split lines and apply their own trimming.
 */
export function stripAnsiForSpeech(input: string): string {
  const s = String(input ?? '');
  // The overwhelming majority of lines carry neither an escape nor a stray
  // control byte; skip five passes over them.
  if (s.indexOf('\x1b') === -1 && !HAS_CONTROL_RE.test(s)) return s;

  return s
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(DANGLING_ESC_RE, '')
    .replace(ESC_SHORT_RE, '')
    .replace(CONTROL_RE, '');
}
