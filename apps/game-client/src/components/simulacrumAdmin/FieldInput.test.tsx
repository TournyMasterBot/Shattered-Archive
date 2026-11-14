import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FieldInput from './FieldInput';
import type { FieldSpec } from '../../features/simulacrumAdmin/commandSyntaxTypes';

const text: FieldSpec = { id: 'target', label: 'Character', type: 'character', placeholder: 'name' };
const choice: FieldSpec = { id: 'flag', label: 'Flag', type: 'choice', choices: ['killer', 'thief'] };

describe('FieldInput: a text box', () => {
  it('shows its label, value and placeholder, and reports each change', () => {
    const onChange = jest.fn();
    render(<FieldInput id="f1" field={text} value="Test" onChange={onChange} />);
    const input = screen.getByLabelText('Character');
    expect(input).toHaveValue('Test');
    expect(input).toHaveAttribute('placeholder', 'name');
    expect(input).toHaveAttribute('autocomplete', 'off');
    fireEvent.change(input, { target: { value: 'Testchar' } });
    expect(onChange).toHaveBeenCalledWith('Testchar');
  });

  it('marks an optional field in its label', () => {
    render(<FieldInput id="f1" field={{ ...text, optional: true }} value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Character (optional)')).toBeInTheDocument();
  });

  it('is valid and silent without an error', () => {
    render(<FieldInput id="f1" field={text} value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Character')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error as an alert and marks the field invalid', () => {
    render(<FieldInput id="f1" field={text} value="a b" error="One word only, no spaces." onChange={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('One word only, no spaces.');
    expect(screen.getByLabelText('Character')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('FieldInput: a choice', () => {
  it('is a select with a "Choose…" first entry and the listed choices', () => {
    render(<FieldInput id="f2" field={choice} value="" onChange={jest.fn()} />);
    const select = screen.getByLabelText('Flag');
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Choose…', 'killer', 'thief']);
  });

  it('offers "(none)" for an optional choice', () => {
    render(<FieldInput id="f2" field={{ ...choice, optional: true }} value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Flag (optional)')).toHaveDisplayValue('(none)');
  });

  it('shows the chosen value and reports a new choice', () => {
    const onChange = jest.fn();
    render(<FieldInput id="f2" field={choice} value="thief" onChange={onChange} />);
    expect(screen.getByLabelText('Flag')).toHaveValue('thief');
    fireEvent.change(screen.getByLabelText('Flag'), { target: { value: 'killer' } });
    expect(onChange).toHaveBeenCalledWith('killer');
  });

  it('marks the select invalid with an error, and offers only "Choose…" when the spec lists no choices', () => {
    render(<FieldInput id="f2" field={{ id: 'x', label: 'Mode', type: 'choice' }} value="" error="Pick one." onChange={jest.fn()} />);
    expect(screen.getByLabelText('Mode')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Mode').querySelectorAll('option')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Pick one.');
  });
});
