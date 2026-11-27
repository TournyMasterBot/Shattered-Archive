import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ReviewStep } from './ReviewStep';
import { emptyDraft } from './useWizardDraft';

// The Review step lists the fight commands; a paused one is shown as such so the player is not surprised by what autopilot skips.

const AREA = {
  slug: 'a',
  areaName: 'Centaur Village',
  continent: 'Arkania',
  areaId: 'A',
  levelRange: [10, 20],
  startRoom: '',
  speedwalkToStart: '',
  requiredActions: [],
  dirs: ['n'],
  notes: '',
  isExcellentLevelingArea: false,
  recommendedTargets: [],
};

describe('ReviewStep buffs', () => {
  it('shows a paused buff as paused and leaves an active one alone', () => {
    const draft = {
      ...emptyDraft(),
      area: AREA as never,
      buffs: [
        { label: 'Armor', cmd: "cast 'armor'", affect: 'armor' },
        { label: 'Haste', cmd: "cast 'haste'", affect: 'haste', disabled: true },
      ],
    };
    render(<ReviewStep draft={draft} onPatch={jest.fn()} />);

    const item = (cmd: string) => screen.getByText(cmd, { selector: 'code' }).closest('li') as HTMLElement;
    expect(within(item("cast 'haste'")).getByText(/paused: will not be used/)).toBeInTheDocument();
    expect(within(item("cast 'armor'")).queryByText(/paused/)).toBeNull();
  });
});

describe('ReviewStep fight commands', () => {
  it('shows a paused command as paused and an active one with its timing', () => {
    const draft = {
      ...emptyDraft(),
      area: AREA as never,
      fightCommands: [
        { cmd: 'bash', cooldownSec: 8 },
        { cmd: 'kick', cooldownSec: 0, disabled: true },
        { cmd: 'trip', cooldownSec: 0 },
      ],
    };
    render(<ReviewStep draft={draft} onPatch={jest.fn()} />);

    const item = (cmd: string) => screen.getByText(cmd, { selector: 'code' }).closest('li') as HTMLElement;
    expect(within(item('bash')).getByText(/every 8s/)).toBeInTheDocument();
    expect(within(item('kick')).getByText(/paused: will not be used/)).toBeInTheDocument();
    expect(within(item('kick')).queryByText(/every/)).toBeNull();
    expect(within(item('trip')).getByText(/every tick/)).toBeInTheDocument();
  });
});
