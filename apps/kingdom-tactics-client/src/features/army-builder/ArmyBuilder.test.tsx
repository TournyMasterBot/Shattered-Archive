import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { App } from '../../App';
import { NavProvider } from '../../state/nav';
import { providers } from '../../state/providers';
import { ArmyBuilderScreen } from './ArmyBuilder';

const warriorCost = providers.data.unitTemplate('Human', 'Warrior').cost;

const renderBuilder = () =>
  render(
    <NavProvider>
      <ArmyBuilderScreen />
    </NavProvider>,
  );

afterEach(cleanup);
beforeEach(() => globalThis.localStorage.clear());

describe('ArmyBuilder', () => {
  it('lists buildable units with costs from the provider', () => {
    renderBuilder();
    expect(screen.getByText(`Warrior · ${warriorCost} pts`)).toBeTruthy();
  });

  it('groups reclasses under their base class in a collapsible tree', () => {
    renderBuilder();
    // Warrior is a base-class top node (pickable)…
    expect(screen.getByRole('button', { name: 'Add Warrior' })).toBeTruthy();
    // …and Samurai (a Warrior reclass) shows as a child under it.
    expect(screen.getByRole('button', { name: 'Add Samurai' })).toBeTruthy();
    // Collapsing the Warrior group hides its reclasses but keeps the base class itself.
    fireEvent.click(screen.getByRole('button', { name: /Collapse Warrior/ }));
    expect(screen.queryByRole('button', { name: 'Add Samurai' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Warrior' })).toBeTruthy();
  });

  it('prices base classes at 10 and reclasses higher (tier cost in the tree)', () => {
    renderBuilder();
    expect(warriorCost).toBe(10); // base class flat price
    // Reveal a reclass (Battlemage via Conclave) and confirm it costs more than a base class.
    fireEvent.change(screen.getByLabelText('Allegiance'), { target: { value: 'Conclave' } });
    const battlemageCost = providers.data.unitTemplate('Human', 'Battlemage').cost;
    expect(battlemageCost).toBeGreaterThan(10);
    expect(screen.getByText(`Battlemage · ${battlemageCost} pts`)).toBeTruthy();
  });

  it('hides a class the selected race is forbidden from (Pixie cannot be a Warrior)', () => {
    renderBuilder();
    // Human can build Warrior…
    expect(screen.getByRole('button', { name: 'Add Warrior' })).toBeTruthy();
    // …but a Pixie cannot (Warrior forbids Pixie).
    fireEvent.change(screen.getByLabelText('Race'), { target: { value: 'Pixie' } });
    expect(screen.queryByRole('button', { name: 'Add Warrior' })).toBeNull();
  });

  it('shows a CSR class only when the army allegiance allows it', () => {
    renderBuilder();
    // Battlemage is a Conclave-only reclass — hidden with no affiliation…
    expect(screen.queryByRole('button', { name: 'Add Battlemage' })).toBeNull();
    // …and revealed once the army joins the Conclave.
    fireEvent.change(screen.getByLabelText('Allegiance'), { target: { value: 'Conclave' } });
    expect(screen.getByRole('button', { name: 'Add Battlemage' })).toBeTruthy();
  });

  it('blocks adding more units than the count budget', () => {
    renderBuilder(); // default Skirmish = 5 units per side (points ignored at this scale)
    const addWarrior = () => screen.getByRole('button', { name: 'Add Warrior' }) as HTMLButtonElement;
    for (let i = 0; i < 5; i++) fireEvent.click(addWarrior());
    expect(addWarrior().disabled).toBe(true); // a 6th exceeds the 5-unit budget
    expect(screen.getByText('Your army (5)')).toBeTruthy();
  });

  it('Start Match builds a valid roster and drops into a playable match', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Army Builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
    // Landed in the match screen with our one-unit army as side 0.
    expect(screen.getByRole('button', { name: 'End turn' })).toBeTruthy();
    expect(screen.getByText('You: 1')).toBeTruthy();
  });

  it('the Authored map option deploys terrain into the match', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Army Builder' }));
    fireEvent.change(screen.getByLabelText('Map'), { target: { value: 'authored' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
    // The arena rendered at least one Forest tile from the authored map.
    expect(document.querySelectorAll('.kt-terrain--forest').length).toBeGreaterThan(0);
  });

  it('an FFA mode starts a 4-side match (human + three AI opponents)', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Army Builder' }));
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'ffa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
    // HUD shows all four sides' counts — the mirror deployed side 0 + three opponents.
    expect(screen.getByText('You: 1')).toBeTruthy();
    expect(screen.getByText('Opponent 2: 1')).toBeTruthy();
    expect(screen.getByText('Opponent 3: 1')).toBeTruthy();
  });

  it('builds both sides independently (per-side editing)', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Army Builder' }));
    // Side 0: one Warrior.
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    // Switch to the opponent and give it two Warriors.
    fireEvent.click(screen.getByRole('button', { name: /Opponent \(/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
    // Asymmetric armies deployed.
    expect(screen.getByText('You: 1')).toBeTruthy();
    expect(screen.getByText('Opponent 1: 2')).toBeTruthy();
  });

  it('saves an army and loads it back', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Add Warrior' }));
    fireEvent.change(screen.getByLabelText('Army name'), { target: { value: 'Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save army' }));
    // Appears in the saved list.
    expect(screen.getByRole('button', { name: 'Load Alpha' })).toBeTruthy();
    // Remove the current pick, then load the saved army back.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Warrior' }));
    expect(screen.getByText('Your army (0)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load Alpha' }));
    expect(screen.getByText('Your army (1)')).toBeTruthy();
  });
});
