import { UserScriptRuntime } from './userScriptRuntime';

// Exact two-line layout produced by this game's `score`/`sc` command.
const SCORE_SHEET_BLOCK = [
  'Score for Talarien, the multifaceted gemstone',
  'Created: Fri Jun 12 22:33:32 2026',
  "You are a Great Wyrm, and if you get any older, you'll die.",
  '----------------------------------------------------------------------------',
  'LEVEL: 42          Race : Topaz dragon      Played: 3887 hours',
  'YEARS: 211         Class: Dragon            Log In: Tue Sep 15 14:37:22 2026',
  "SEX  : Female   Reclass@: Not Reclassed    ",
].join('\n');

describe('UserScriptRuntime score-sheet identity scanning', () => {
  beforeEach(() => {
    delete (window as any).__SA_IDENTITY__;
  });

  it('extracts race and class from a full score sheet block', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: SCORE_SHEET_BLOCK });

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBe('Dragon');
  });

  it('extracts race alone when only that line has arrived yet', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: 'LEVEL: 42          Race : Topaz dragon      Played: 3887 hours' });

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBeUndefined();
  });

  it('preserves a previously captured field when a later event updates the other one', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: 'LEVEL: 42          Race : Topaz dragon      Played: 3887 hours' });
    await runtime.processRawEvent({
      rawText: 'YEARS: 211         Class: Dragon            Log In: Tue Sep 15 14:37:22 2026',
    });

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBe('Dragon');
  });

  it('does nothing for ordinary game output', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: 'You swing your sword at the orc.\n' });

    expect((window as any).__SA_IDENTITY__?.raceName).toBeUndefined();
    expect((window as any).__SA_IDENTITY__?.className).toBeUndefined();
  });
});
