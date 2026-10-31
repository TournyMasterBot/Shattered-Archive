// apps/game-client/src/components/ScriptingHelpModal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScriptingHelpModal from './ScriptingHelpModal';

// jsdom has neither of these; the modal uses them to follow and to jump between sections.
beforeAll(() => {
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

let scrolled: Element[] = [];
beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
});

const section = (id: string) => document.querySelector(`[data-section="${id}"]`) as HTMLElement;

describe('ScriptingHelpModal — Global Scripts', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<ScriptingHelpModal isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists Global Scripts in the side nav, between Variables and Practical Examples', () => {
    render(<ScriptingHelpModal isOpen onClose={jest.fn()} />);

    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    const at = (label: string) => labels.indexOf(label);

    expect(at('Global Scripts')).toBeGreaterThan(-1);
    expect(at('Variables')).toBeLessThan(at('Global Scripts'));
    expect(at('Global Scripts')).toBeLessThan(at('Practical Examples'));
  });

  it('jumps to the section when its nav button is clicked', () => {
    render(<ScriptingHelpModal isOpen onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Global Scripts' }));

    expect(scrolled).toEqual([section('globals')]);
  });

  it('explains how to call a global from any language, with results and callbacks', () => {
    render(<ScriptingHelpModal isOpen onClose={jest.fn()} />);
    const text = section('globals').textContent ?? '';

    // names by bare name for JS / TS
    expect(text).toContain('call it by name');
    expect(text).toContain('top-level await works');
    // the engines
    expect(text).toContain('one shared program');
    expect(text).toContain('restarts it');
    // the contract
    expect(text).toContain('runGlobal("global.<language>.<name>", args)');
    expect(text).toContain('ordinary call');
    expect(text).toContain('always called afterwards');
    expect(text).toContain('Plain data only');
  });

  it('shows the code samples with their line breaks and escapes intact', () => {
    render(<ScriptingHelpModal isOpen onClose={jest.fn()} />);
    const code = Array.from(section('globals').querySelectorAll('pre')).map((p) => p.textContent ?? '');

    expect(code.some((c) => c.includes('exports.double = (args) => args.n * 2;'))).toBe(true);
    expect(code.some((c) => c.includes('function bump() counter = counter + 1 end'))).toBe(true);
    // a sample that writes "\n" shows a backslash-n, not a newline or two backslashes
    expect(code.some((c) => c.includes('writeTerminal("counter is " .. counter .. "\\n")'))).toBe(true);
    expect(code.some((c) => c.includes('runGlobal("global.lua.core.add", { a: 40, b: 2 })'))).toBe(true);
  });

  it('closes when the close button is pressed', () => {
    const onClose = jest.fn();
    render(<ScriptingHelpModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
