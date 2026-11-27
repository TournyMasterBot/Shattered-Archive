/**
 * @jest-environment node
 */
// A non-browser environment (no `window`): the migration must be a harmless no-op.
import { runConnectionIdMigration } from './connectionIdMigration';

describe('runConnectionIdMigration without a window', () => {
  it('has no window in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  it('resolves with an empty report and touches nothing', async () => {
    const report = await runConnectionIdMigration();

    expect(report).toEqual({ moved: [], merged: [], rows: 0, skipped: [] });
  });
});
