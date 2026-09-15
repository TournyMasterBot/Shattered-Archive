import { UserScriptRuntime } from './userScriptRuntime';

// Exact bracketed status prompt this game sends after most command output.
const NIGHT_PROMPT =
  '<9:00pm|1964|1964|700|700|368|368|W|1340654|946|2667|13254|0|392|0|Offensive|neutral|Common|Night Time|0||||1845|1906|The Crystal Heart>';
const DAY_PROMPT =
  '<9:00am|1964|1964|700|700|368|368|W|1340654|946|2667|13254|0|392|0|Offensive|neutral|Common|Day Time|0||||1845|1906|The Crystal Heart>';

// A custom player-configured prompt (`<%h/%Hhp %m/%Mm %v/%Vmv %X tnl> |%d|%t| [%e]`)
// — the period sits outside the <...> vitals bracket entirely, proving the
// scan can't assume any fixed enclosing structure, only "pipe-delimited".
const CUSTOM_PROMPT = '<1964/1964hp 700/700m 368/368mv 946 tnl> |Day Time|6:00pm| [E]';

describe('UserScriptRuntime world-time-of-day scanning', () => {
  beforeEach(() => {
    delete (window as any).__SA_WORLD_TIME__;
  });

  it('extracts the period from the bracketed status prompt', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: NIGHT_PROMPT });

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Night Time');
  });

  it('extracts the period from a differently-shaped custom prompt', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: CUSTOM_PROMPT });

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Day Time');
  });

  it('updates on a later prompt with a different period', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: NIGHT_PROMPT });
    await runtime.processRawEvent({ rawText: DAY_PROMPT });

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Day Time');
  });

  it('does nothing for ordinary game output', async () => {
    const runtime = new UserScriptRuntime();
    await runtime.processRawEvent({ rawText: 'You swing your sword at the orc.\n' });

    expect((window as any).__SA_WORLD_TIME__?.period).toBeUndefined();
  });
});
