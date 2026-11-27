import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

jest.mock('../features/auth/authTokenStore', () => ({
  getToken: jest.fn(() => ({ token: 't', expiresAt: '2999-01-01T00:00:00Z' })),
  isExpired: jest.fn(() => false),
  subscribeToToken: jest.fn(() => () => {}),
}));

// What the "server" holds, per organization and content type.
const mockServer: { content: Record<string, any[]>; role: string; saveResult: any; hold: Promise<void> | null } = {
  content: {},
  role: 'leader',
  saveResult: null,
  hold: null,
};

jest.mock('../features/library/org-content', () => ({
  listMyOrganizations: jest.fn(async () => ({
    kind: 'ok',
    data: [
      { id: 'o1', name: 'Alpha Guild', categorySlug: 'a', role: 'leader' },
      { id: 'o2', name: 'Beta Guild', categorySlug: 'b', role: 'leader' },
    ],
  })),
  getOrganization: jest.fn(async (id: string) => ({
    kind: 'ok',
    data: {
      id,
      name: id,
      categorySlug: id,
      createdAt: '',
      currentEpoch: 1,
      myCharacterMemberships: [{ characterId: 'c1', characterName: 'Mira', role: mockServer.role }],
    },
  })),
  listOrgContent: jest.fn(async (org: string, type: string) => {
    if (mockServer.hold) await mockServer.hold;
    return { kind: 'ok', data: (mockServer.content[`${org}/${type}`] ?? []).map((x) => ({ ...x })) };
  }),
  saveOrgContent: jest.fn(async (org: string, type: string, id: string, item: any) => {
    if (mockServer.saveResult) return mockServer.saveResult;
    const list = (mockServer.content[`${org}/${type}`] ??= []);
    const i = list.findIndex((x) => x.id === id);
    const next = { id, ...item };
    if (i >= 0) list[i] = next;
    else list.push(next);
    return { kind: 'ok', data: { id, authorCharacterId: 'c1', authorCharacterName: 'Mira', revisionNumber: 1 } };
  }),
  deleteOrgContent: jest.fn(async () => ({ kind: 'ok', data: undefined })),
}));

import OrganizationsPane from './OrganizationsPane';
import { saveOrgContent } from '../features/library/org-content';

const saveMock = saveOrgContent as jest.Mock;

let confirmSpy: jest.SpyInstance;
let onDirtyChange: jest.Mock;

const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => {});
};

async function open() {
  onDirtyChange = jest.fn();
  await act(async () => {
    render(<OrganizationsPane onDirtyChange={onDirtyChange} />);
  });
  await flush();
}

const click = async (name: string) => {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name })));
  await flush();
};
const row = (label: string) => screen.getByText(label).closest('button')!;
const clickRow = async (label: string) => {
  await act(async () => void fireEvent.click(row(label)));
  await flush();
};
const body = () => screen.getByPlaceholderText(/Write here…|You need Moderator/) as HTMLTextAreaElement;
const title = () => screen.getByPlaceholderText('Title') as HTMLInputElement;
const category = () => screen.getByPlaceholderText(/^Folder path/) as HTMLInputElement;
const typeBody = (text: string) => act(() => void fireEvent.change(body(), { target: { value: text } }));
const lastDirty = () => onDirtyChange.mock.calls[onDirtyChange.mock.calls.length - 1];
const unload = () => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

beforeEach(() => {
  mockServer.role = 'leader';
  mockServer.saveResult = null;
  mockServer.hold = null;
  mockServer.content = {
    'o1/parchment': [
      { id: 'i1', title: 'Charter', body: 'charter text' },
      { id: 'i2', title: 'Bylaws', body: 'bylaws text' },
    ],
    'o1/notes': [{ id: 'n1', title: 'Memo', body: 'memo text', spool: 'note' }],
    'o2/parchment': [{ id: 'x1', title: 'Beta Rules', body: 'beta text' }],
  };
  jest.clearAllMocks();
  confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('OrganizationsPane unsaved changes', () => {
  const edit = async () => {
    await open();
    await clickRow('Charter');
    expect(body().value).toBe('charter text');
    typeBody('charter text, edited');
  };

  it('moves to another item without asking when nothing was changed', async () => {
    await open();
    await clickRow('Charter');
    await clickRow('Bylaws');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('bylaws text');
  });

  it('asks before leaving an item with unsaved text, naming it, and stays when declined', async () => {
    await edit();
    confirmSpy.mockReturnValue(false);
    await clickRow('Bylaws');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('organization item "Charter"');
    expect(body().value).toBe('charter text, edited');
  });

  it('moves on and drops the draft when agreed', async () => {
    await edit();
    await clickRow('Bylaws');
    expect(body().value).toBe('bylaws text');
    await clickRow('Charter');
    expect(body().value).toBe('charter text');
  });

  it('does not ask when the same item is clicked again', async () => {
    await edit();
    await clickRow('Charter');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('charter text, edited');
  });

  it('does not ask when the edit was typed back to what is saved', async () => {
    await open();
    await clickRow('Charter');
    typeBody('charter text!');
    typeBody('charter text');
    await clickRow('Bylaws');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('counts a changed title and a changed folder path', async () => {
    await open();
    await clickRow('Charter');
    act(() => void fireEvent.change(title(), { target: { value: 'Charter II' } }));
    confirmSpy.mockReturnValue(false);
    await clickRow('Bylaws');
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    act(() => void fireEvent.change(title(), { target: { value: 'Charter' } }));
    act(() => void fireEvent.change(category(), { target: { value: 'Rules' } }));
    await clickRow('Bylaws');
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('does not ask once the draft has been saved', async () => {
    await edit();
    await click('Save');
    expect(saveMock).toHaveBeenCalledTimes(1);

    await clickRow('Bylaws');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('bylaws text');
  });

  it('a new item that has just been saved is not unsaved work while the list is still reloading', async () => {
    await open();
    typeBody('a fresh note');
    let release!: () => void;
    mockServer.hold = new Promise<void>((resolve) => (release = resolve));

    await click('Save');
    expect(saveMock).toHaveBeenCalledTimes(1);

    // The item is selected, but the reloaded list that would contain it has not arrived.
    await click('Notes');
    expect(confirmSpy).not.toHaveBeenCalled();
    release();
    await flush();
  });

  it('guards the + New button', async () => {
    await edit();
    confirmSpy.mockReturnValue(false);
    await click('+ New');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('charter text, edited');

    confirmSpy.mockReturnValue(true);
    await click('+ New');
    expect(body().value).toBe('');
    expect(title().value).toBe('');
  });

  it('does not guard + New when nothing is unsaved', async () => {
    await open();
    await clickRow('Charter');
    await click('+ New');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('');
  });

  it('guards switching the content type, and does not ask for the one already shown', async () => {
    await edit();
    await click('Parchment');
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(false);
    await click('Notes');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('charter text, edited');

    confirmSpy.mockReturnValue(true);
    await click('Notes');
    await clickRow('Memo');
    expect(body().value).toBe('memo text');
  });

  it('guards switching organization, and does not ask for the one already shown', async () => {
    await edit();
    const select = () => screen.getByDisplayValue('Alpha Guild') as HTMLSelectElement;

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.change(select(), { target: { value: 'o2' } }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('charter text, edited');

    confirmSpy.mockReturnValue(true);
    await act(async () => void fireEvent.change(select(), { target: { value: 'o1' } }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    await act(async () => void fireEvent.change(select(), { target: { value: 'o2' } }));
    await flush();
    await clickRow('Beta Rules');
    expect(body().value).toBe('beta text');
  });

  it('a new item with text typed into it counts as unsaved', async () => {
    await open();
    typeBody('brand new thought');
    confirmSpy.mockReturnValue(false);
    await clickRow('Charter');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});

describe('OrganizationsPane reports to the Library', () => {
  it('says when the draft gains and loses unsaved changes, with its title', async () => {
    await open();
    await clickRow('Charter');
    expect(lastDirty()).toEqual([false, 'Charter']);

    typeBody('charter text, edited');
    expect(lastDirty()).toEqual([true, 'Charter']);

    typeBody('charter text');
    expect(lastDirty()).toEqual([false, 'Charter']);
  });

  it('reports clean when it goes away, so a draft that is gone does not keep the Library asking', async () => {
    await open();
    await clickRow('Charter');
    typeBody('edited');
    expect(lastDirty()[0]).toBe(true);

    cleanup();

    expect(lastDirty()).toEqual([false, '']);
  });

  it('works without a listener', async () => {
    await act(async () => {
      render(<OrganizationsPane />);
    });
    await flush();
    await clickRow('Charter');
    expect(body().value).toBe('charter text');
  });
});

describe('OrganizationsPane browser tab close', () => {
  it('is held while there are unsaved changes, and released once they are gone', async () => {
    await open();
    await clickRow('Charter');
    expect(unload()).toBe(false);

    typeBody('edited');
    expect(unload()).toBe(true);

    await click('Save');
    expect(unload()).toBe(false);
  });
});
