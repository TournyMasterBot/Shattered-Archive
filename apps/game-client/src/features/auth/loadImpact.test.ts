import {
  describeLoadResult,
  planCloudLoad,
  savesThatWouldErase,
  type CloudDataSummary,
  type LoadResultCounts,
  type LocalDataSummary,
} from './loadImpact';

const local = (over: Partial<LocalDataSummary> = {}): LocalDataSummary => ({
  scripts: 0,
  plugins: 0,
  globalLanguages: [],
  ...over,
});
const cloud = (over: Partial<CloudDataSummary> = {}): CloudDataSummary => ({
  scripts: 0,
  plugins: 0,
  globalLanguages: [],
  replacedOtherGlobals: [],
  ...over,
});

describe('planCloudLoad', () => {
  it('never replaces anything with an empty cloud', () => {
    const plan = planCloudLoad(local({ scripts: 5, plugins: 2, globalLanguages: ['lua'] }), cloud());
    expect(plan.replaceScripts).toBe(false);
    expect(plan.replacePlugins).toBe(false);
    expect(plan.replaceGlobals).toBe(false);
    expect(plan.needsConfirm).toBe(false);
    expect(plan.destructive).toBe(false);
    expect(plan.message).toContain('The cloud has no scripts, so the 5 scripts on this connection will be kept.');
  });

  it('warns strongly, with counts, when cloud scripts will replace local ones', () => {
    const plan = planCloudLoad(local({ scripts: 5 }), cloud({ scripts: 9 }));
    expect(plan.replaceScripts).toBe(true);
    expect(plan.needsConfirm).toBe(true);
    expect(plan.destructive).toBe(true);
    expect(plan.title).toBe('Replace data on this connection?');
    expect(plan.message).toContain('5 scripts on this connection will be REPLACED by the 9 scripts saved in the cloud');
    expect(plan.message).toContain('permanently lost');
    expect(plan.message).toContain('Save to the cloud first');
  });

  it('uses the singular for one script', () => {
    const plan = planCloudLoad(local({ scripts: 1 }), cloud({ scripts: 1 }));
    expect(plan.message).toContain('1 script on this connection will be REPLACED by the 1 script saved');
  });

  it('is a plain, non-destructive load when this connection has nothing to lose', () => {
    const plan = planCloudLoad(local(), cloud({ scripts: 3 }));
    expect(plan.needsConfirm).toBe(true);
    expect(plan.destructive).toBe(false);
    expect(plan.title).toBe('Load from the cloud?');
    expect(plan.message).toContain('3 scripts from the cloud will be copied to this connection.');
    expect(plan.message).not.toContain('REPLACED');
  });

  it('names the local global-script languages that will be replaced', () => {
    const plan = planCloudLoad(local({ globalLanguages: ['javascript', 'lua'] }), cloud({ globalLanguages: ['python'] }));
    expect(plan.replaceGlobals).toBe(true);
    expect(plan.destructive).toBe(true);
    expect(plan.message).toContain('Your global scripts (javascript, lua) will be REPLACED by the cloud');
  });

  it('copies cloud globals without a warning when there are none locally', () => {
    const plan = planCloudLoad(local({ scripts: 2 }), cloud({ globalLanguages: ['lua'] }));
    expect(plan.replaceGlobals).toBe(true);
    expect(plan.destructive).toBe(false);
    expect(plan.message).toContain('Global scripts from the cloud will be copied to this connection.');
  });

  it("warns about other servers' global scripts that will be replaced too", () => {
    const plan = planCloudLoad(local(), cloud({ replacedOtherGlobals: ['mud.example.com:4000'] }));
    expect(plan.replaceGlobals).toBe(true);
    expect(plan.destructive).toBe(true);
    expect(plan.message).toContain('Global scripts for other servers (mud.example.com:4000) will also be REPLACED.');
  });

  it('warns when installed plugins will be replaced, and installs quietly when there are none', () => {
    const replacing = planCloudLoad(local({ plugins: 3 }), cloud({ plugins: 5 }));
    expect(replacing.replacePlugins).toBe(true);
    expect(replacing.destructive).toBe(true);
    expect(replacing.message).toContain('Your 3 installed plugins and their settings will be REPLACED by the cloud\'s 5.');

    const installing = planCloudLoad(local(), cloud({ plugins: 1 }));
    expect(installing.destructive).toBe(false);
    expect(installing.message).toContain('1 plugin and their settings from the cloud will be installed.');
  });

  it('says merge-only collections are never deleted, and only offers the Save hint when destructive', () => {
    expect(planCloudLoad(local(), cloud({ scripts: 1 })).message).toContain('nothing there is deleted');
    expect(planCloudLoad(local(), cloud({ scripts: 1 })).message).not.toContain('Save to the cloud first');
  });
});

describe('savesThatWouldErase', () => {
  const none = { scripts: 0, plugins: 0, hasGlobals: false };

  it('is empty when nothing local is empty over a non-empty cloud copy', () => {
    expect(savesThatWouldErase({ local: { scripts: 2, plugins: 1, hasGlobals: true }, cloud: { scripts: 5, plugins: 3, hasGlobals: true } })).toEqual([]);
    expect(savesThatWouldErase({ local: none, cloud: none })).toEqual([]);
  });

  it('flags each empty local collection that would erase a non-empty cloud one', () => {
    const lines = savesThatWouldErase({ local: none, cloud: { scripts: 3, plugins: 2, hasGlobals: true } });
    expect(lines).toEqual([
      'this connection has no scripts, so the 3 scripts in the cloud would be erased',
      'no plugins are installed here, so the 2 plugins saved in the cloud would be erased',
      'this device has no global scripts, so the ones saved in the cloud would be erased',
    ]);
  });

  it('flags only the collection that is actually empty', () => {
    const lines = savesThatWouldErase({
      local: { scripts: 4, plugins: 0, hasGlobals: true },
      cloud: { scripts: 4, plugins: 1, hasGlobals: true },
    });
    expect(lines).toEqual(['no plugins are installed here, so the 1 plugin saved in the cloud would be erased']);
  });
});

describe('describeLoadResult', () => {
  const counts = (over: Partial<LoadResultCounts> = {}): LoadResultCounts => ({
    scripts: 0,
    plugins: 0,
    globalBuckets: 0,
    parchment: 0,
    notes: 0,
    books: 0,
    autolevelRecords: 0,
    ...over,
  });

  it('says nothing was loaded, and that local scripts were kept, for an empty cloud', () => {
    const r = describeLoadResult(planCloudLoad(local({ scripts: 3 }), cloud()), counts(), 3);
    expect(r.changed).toBe(false);
    expect(r.text).toContain('Nothing is saved to this account yet.');
    expect(r.text).toContain('The 3 scripts on this connection were not touched.');
  });

  it('uses "was" for a single kept script', () => {
    const r = describeLoadResult(planCloudLoad(local({ scripts: 1 }), cloud()), counts(), 1);
    expect(r.text).toContain('The 1 script on this connection was not touched.');
  });

  it('omits the kept-scripts sentence when there were none locally', () => {
    const r = describeLoadResult(planCloudLoad(local(), cloud()), counts(), 0);
    expect(r.changed).toBe(false);
    expect(r.text).not.toContain('were not touched');
  });

  it('reports what was applied and that the page reloads', () => {
    const plan = planCloudLoad(local({ scripts: 1 }), cloud({ scripts: 3, plugins: 2, globalLanguages: ['lua'] }));
    const r = describeLoadResult(plan, counts({ scripts: 3, plugins: 2, globalBuckets: 1, parchment: 4, notes: 1, books: 2, autolevelRecords: 6 }), 1);
    expect(r.changed).toBe(true);
    expect(r.text).toBe(
      'Loaded 3 scripts, 2 plugin configs, 1 global-script set; merged 4 parchment / 1 note(s) / 2 book(s) and 6 auto-leveling record(s). Reloading to apply…',
    );
  });

  it('counts merged library or auto-leveling data as a change even when no scripts were replaced', () => {
    const r = describeLoadResult(planCloudLoad(local(), cloud()), counts({ notes: 2 }), 0);
    expect(r.changed).toBe(true);
    expect(r.text).toContain('Loaded no scripts or plugins; merged 0 parchment / 2 note(s)');
  });
});
