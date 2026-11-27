import { trimDashes } from './trimDashes.js';

describe('trimDashes', () => {
  it('removes hyphens at both ends and keeps the ones inside', () => {
    expect(trimDashes('---a--b---')).toBe('a--b');
    expect(trimDashes('a-b')).toBe('a-b');
    expect(trimDashes('----')).toBe('');
    expect(trimDashes('')).toBe('');
  });

  it('handles a very long run of hyphens that does not end the text', () => {
    const hostile = `${'-'.repeat(200_000)}a`;
    expect(trimDashes(hostile)).toBe('a');
    expect(trimDashes(`a${'-'.repeat(200_000)}a`)).toHaveLength(200_002);
  });
});
