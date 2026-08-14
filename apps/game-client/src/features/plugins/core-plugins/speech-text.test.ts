import { stripAnsiForSpeech } from './speech-text';

describe('stripAnsiForSpeech', () => {
  it('leaves ordinary text untouched', () => {
    expect(stripAnsiForSpeech('A dusty road stretches north.')).toBe('A dusty road stretches north.');
  });

  it('strips SGR color runs', () => {
    expect(stripAnsiForSpeech('\x1b[1;37mYou hit the goblin.\x1b[0m')).toBe('You hit the goblin.');
    expect(stripAnsiForSpeech('\x1b[38;5;208mOrange.\x1b[0m')).toBe('Orange.');
  });

  it('strips non-color CSI sequences the SGR-only pattern left behind', () => {
    // Erase-line, clear-screen and cursor-home are what the old ".*m" pattern
    // missed, so the synthesizer read out "2 J" and "K".
    expect(stripAnsiForSpeech('\x1b[2J\x1b[HYou are here.\x1b[K')).toBe('You are here.');
  });

  it('strips private-mode toggles, whose "?" the SGR pattern never allowed', () => {
    expect(stripAnsiForSpeech('\x1b[?25lHidden cursor.\x1b[?25h')).toBe('Hidden cursor.');
  });

  it('strips OSC strings, terminated or not', () => {
    expect(stripAnsiForSpeech('\x1b]0;Shattered Archive\x07Welcome.')).toBe('Welcome.');
    expect(stripAnsiForSpeech('Welcome.\x1b]0;cut off mid-title')).toBe('Welcome.');
  });

  it('strips a sequence cut in half by a chunk boundary', () => {
    expect(stripAnsiForSpeech('The goblin dies.\x1b[1;3')).toBe('The goblin dies.');
    expect(stripAnsiForSpeech('The goblin dies.\x1b')).toBe('The goblin dies.');
  });

  it('strips stray control bytes but keeps tab, newline and carriage return', () => {
    expect(stripAnsiForSpeech('\x01Section\x07 marker')).toBe('Section marker');
    expect(stripAnsiForSpeech('one\ttwo\r\nthree')).toBe('one\ttwo\r\nthree');
  });

  it('reduces an all-escape line to nothing', () => {
    expect(stripAnsiForSpeech('\x1b[2J\x1b[?25l\x1b[0m')).toBe('');
  });

  it('does not eat digits and letters that merely look like a sequence tail', () => {
    // The prompt is the case to protect: "200m" is mana, not the tail of a
    // colour code, which is why the orphaned half of a split sequence is left
    // alone rather than guessed at.
    expect(stripAnsiForSpeech('100hp 200m 50mv 1000tnl>')).toBe('100hp 200m 50mv 1000tnl>');
    expect(stripAnsiForSpeech('You gain 38;5 experience.')).toBe('You gain 38;5 experience.');
  });
});
