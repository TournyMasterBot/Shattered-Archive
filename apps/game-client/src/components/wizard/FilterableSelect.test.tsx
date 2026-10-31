import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { FilterableSelect, type FilterableSelectOption } from './FilterableSelect';

// Consecutive options that share a `group` get ONE header, like the <optgroup> layout this replaces. The header decision is
// made against the list actually shown (after filtering), not against the full list.

const OPTIONS: FilterableSelectOption[] = [
  { value: 'alpha', label: 'Alpha', group: 'Skills' },
  { value: 'bravo', label: 'Bravo', group: 'Skills' },
  { value: 'charlie', label: 'Charlie', group: 'Spells' },
  { value: 'delta', label: 'Delta', group: 'Skills' },
  { value: 'echo', label: 'Echo' },
  { value: 'foxtrot', label: 'Foxtrot' },
];

function setup(options = OPTIONS) {
  const onPick = jest.fn();
  render(<FilterableSelect options={options} onPick={onPick} placeholder="Pick one" ariaLabel="Ability" />);
  const input = screen.getByLabelText('Ability');
  fireEvent.focus(input);
  return { onPick, input };
}

const headers = () => Array.from(document.querySelectorAll('li[aria-hidden="true"]')).map((li) => li.textContent);
const optionLabels = () => screen.getAllByRole('option').map((li) => li.textContent);

describe('FilterableSelect group headers', () => {
  it('shows one header per run of options with the same group, and again when a group returns', () => {
    setup();

    expect(headers()).toEqual(['Skills', 'Spells', 'Skills']);
  });

  it('shows no header for options without a group', () => {
    setup([
      { value: 'echo', label: 'Echo' },
      { value: 'foxtrot', label: 'Foxtrot' },
    ]);

    expect(headers()).toEqual([]);
    expect(optionLabels()).toEqual(['Echo', 'Foxtrot']);
  });

  it('puts a header on the first shown option even when the filter hides the start of its group', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'lt' } }); // only Delta, the last "Skills" option

    expect(optionLabels()).toEqual(['Delta']);
    expect(headers()).toEqual(['Skills']);
  });

  it('shows the header of the group that remains after filtering', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'ar' } }); // only Charlie

    expect(optionLabels()).toEqual(['Charlie']);
    expect(headers()).toEqual(['Spells']);
  });

  it('shows a header again for a group whose earlier run was filtered out', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'l' } }); // Alpha, Charlie, Delta (+ Echo? no: no "l"), so three groups in order

    expect(optionLabels()).toEqual(['Alpha', 'Charlie', 'Delta']);
    expect(headers()).toEqual(['Skills', 'Spells', 'Skills']);
  });

  it('commits the clicked option and closes the list', () => {
    const { onPick } = setup();

    fireEvent.mouseDown(screen.getByRole('option', { name: 'Charlie' }));

    expect(onPick).toHaveBeenCalledWith('charlie');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('FilterableSelect typeahead behaviour', () => {
  const activeLabel = () =>
    screen.getAllByRole('option').find((li) => li.getAttribute('aria-selected') === 'true')?.textContent;
  const key = (input: HTMLElement, k: string) => fireEvent.keyDown(input, { key: k });

  it('opens when focused and closes when the user clicks elsewhere, but not when they click inside it', () => {
    const { input } = setup();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('stays closed until focused', () => {
    render(<FilterableSelect options={OPTIONS} onPick={jest.fn()} placeholder="Pick one" ariaLabel="Ability" />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves the highlight down with ArrowDown and stops at the last option', () => {
    const { input } = setup();
    expect(activeLabel()).toBe('Alpha');

    key(input, 'ArrowDown');
    expect(activeLabel()).toBe('Bravo');

    for (let i = 0; i < 10; i++) key(input, 'ArrowDown');
    expect(activeLabel()).toBe('Foxtrot');
  });

  it('moves the highlight up with ArrowUp and stops at the first option', () => {
    const { input } = setup();
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    expect(activeLabel()).toBe('Charlie');

    key(input, 'ArrowUp');
    expect(activeLabel()).toBe('Bravo');

    for (let i = 0; i < 5; i++) key(input, 'ArrowUp');
    expect(activeLabel()).toBe('Alpha');
  });

  it('opens a closed list on ArrowDown, with the first option highlighted', () => {
    const { input } = setup();
    key(input, 'Escape');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    key(input, 'ArrowDown');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(activeLabel()).toBe('Alpha');
  });

  it('commits the highlighted option on Enter, clears the box and closes the list', () => {
    const { onPick, input } = setup();
    key(input, 'ArrowDown');

    key(input, 'Enter');

    expect(onPick).toHaveBeenCalledWith('bravo');
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does nothing on Enter while the list is closed', () => {
    const onPick = jest.fn();
    render(<FilterableSelect options={OPTIONS} onPick={onPick} placeholder="Pick one" ariaLabel="Ability" />);

    key(screen.getByLabelText('Ability'), 'Enter');

    expect(onPick).not.toHaveBeenCalled();
  });

  it('does nothing on Enter when nothing matches the typed text', () => {
    const { onPick, input } = setup();

    fireEvent.change(input, { target: { value: 'zzz' } });
    key(input, 'Enter');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('closes on Escape without picking anything', () => {
    const { onPick, input } = setup();

    key(input, 'Escape');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const { onPick, input } = setup();
    key(input, 'ArrowDown');

    key(input, 'a');

    expect(activeLabel()).toBe('Bravo');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('typing reopens a closed list and puts the highlight back on the first match', () => {
    const { input } = setup();
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    key(input, 'Escape');

    fireEvent.change(input, { target: { value: 'o' } }); // Bravo, Echo, Foxtrot

    expect(optionLabels()).toEqual(['Bravo', 'Echo', 'Foxtrot']);
    expect(activeLabel()).toBe('Bravo');
  });

  it('shows every option for a blank or whitespace-only query', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: '   ' } });

    expect(optionLabels()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']);
  });

  it('matches the typed text case-insensitively anywhere in the label', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: 'ELT' } });

    expect(optionLabels()).toEqual(['Delta']);
  });

  it('highlights the option the pointer moves over', () => {
    setup();

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Delta' }));

    expect(activeLabel()).toBe('Delta');
  });
});
