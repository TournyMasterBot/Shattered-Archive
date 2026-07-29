import type { Theme } from '../../theme/useTheme.js';

/**
 * The light/dark switch. A single button rather than a segmented control: there are exactly
 * two states, and its label announces the state it will MOVE to, which is what a screen
 * reader user needs from a toggle.
 */
export default function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="sp-btn sp-btn-icon"
      onClick={onToggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
