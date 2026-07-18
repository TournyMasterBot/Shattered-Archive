import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ImportAreaPanel from './ImportAreaPanel.js';
import type { ImportReport } from '../../api/client.js';

/**
 * .are import panel (Phase 10): quarantine report display, error blocking,
 * explicit-overwrite gating, and the commit call.
 */

const CLEAN_REPORT: ImportReport = {
  file: 'imported.are',
  exists: false,
  registered: false,
  errors: [],
  warnings: [],
  externalRefs: [],
  normalizedText: '#AREA\n...normalized...\n#$\n',
  summary: { mobiles: 2, rooms: 5 },
};

describe('ImportAreaPanel', () => {
  let report: ImportReport;
  let commits: { file: string; text: string; overwrite: boolean }[];
  let imported: { file: string; note: string }[];

  const setup = (props: Partial<Parameters<typeof ImportAreaPanel>[0]> = {}) => {
    render(
      <ImportAreaPanel
        writesOff={false}
        gateTip={undefined}
        onImported={(file, note) => {
          imported.push({ file, note });
        }}
        onClose={() => {}}
        {...props}
      />,
    );
  };

  const fillAndValidate = async () => {
    fireEvent.change(screen.getByLabelText('Import file name'), { target: { value: 'imported.are' } });
    fireEvent.change(screen.getByLabelText('Area file text'), { target: { value: '#AREA raw upload #$' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Validation report');
  };

  beforeEach(() => {
    report = { ...CLEAN_REPORT };
    commits = [];
    imported = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/import/area/preview') && init?.method === 'POST') {
        return json({ report });
      }
      if (url.endsWith('/api/import/area') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { file: string; text: string; overwrite: boolean };
        commits.push(body);
        if (report.exists && !body.overwrite) return json({ error: 'already exists' }, 409);
        return json({
          file: body.file,
          imported: true,
          backupPath: null,
          lstBackupPath: 'backups/area.lst.bak',
          requiresCopyover: true,
          note: 'registered in area.lst — copyover to load',
        });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;
  });

  it('validates a clean upload and commits it (overwrite defaults to false)', async () => {
    setup();
    await fillAndValidate();

    expect(screen.getByText(/Clean — no blocking errors/)).toBeTruthy();
    expect(screen.getByLabelText('Entity summary').textContent).toContain('mobiles: 2');
    expect((screen.getByLabelText('Canonical text') as HTMLTextAreaElement).value).toBe(CLEAN_REPORT.normalizedText);

    fireEvent.click(screen.getByRole('button', { name: 'Commit import' }));
    await waitFor(() => expect(imported).toHaveLength(1));
    expect(commits).toEqual([{ file: 'imported.are', text: '#AREA raw upload #$', overwrite: false }]);
    expect(imported[0].note).toContain('copyover');
  });

  it('blocks the commit on report errors and lists them', async () => {
    report = { ...CLEAN_REPORT, errors: ['vnum range 100-199 overlaps tiny.are (100-199)'], normalizedText: null, summary: null };
    setup();
    await fillAndValidate();

    expect(screen.getByText(/1 error\(s\) block this import/)).toBeTruthy();
    expect(screen.getByText(/overlaps tiny\.are/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Commit import' }) as HTMLButtonElement).disabled).toBe(true);
    expect(commits).toHaveLength(0);
  });

  it('requires the explicit overwrite checkbox for an existing file', async () => {
    report = {
      ...CLEAN_REPORT,
      exists: true,
      registered: true,
      warnings: ['imported.are already exists on disk — committing requires "overwrite": true'],
    };
    setup();
    await fillAndValidate();

    const commit = screen.getByRole('button', { name: 'Commit import' }) as HTMLButtonElement;
    expect(commit.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Overwrite existing file'));
    expect(commit.disabled).toBe(false);
    fireEvent.click(commit);
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0].overwrite).toBe(true);
  });

  it('keeps the commit disabled while the server gates writes off', async () => {
    setup({ writesOff: true, gateTip: 'writes disabled' });
    await fillAndValidate();
    expect((screen.getByRole('button', { name: 'Commit import' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('invalidates a stale report when the text changes', async () => {
    setup();
    await fillAndValidate();
    fireEvent.change(screen.getByLabelText('Area file text'), { target: { value: '#AREA changed #$' } });
    expect(screen.queryByText('Validation report')).toBeNull();
  });

  it('lists resolved cross-area refs from the report (Phase 11)', async () => {
    report = {
      ...CLEAN_REPORT,
      externalRefs: [{ kind: 'room', vnum: 3001, where: 'room 210 exit 0', file: 'midgaard.are', name: 'The Temple Square' }],
    };
    setup();
    await fillAndValidate();
    expect(screen.getByText('1 cross-area reference(s) — resolved, all targets exist')).toBeTruthy();
    expect(screen.getByText(/room #3001 — The Temple Square \(midgaard\.are\)/)).toBeTruthy();
  });
});
