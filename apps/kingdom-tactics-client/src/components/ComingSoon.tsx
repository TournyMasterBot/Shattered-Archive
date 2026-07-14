import { useNav } from '../state/nav';

/**
 * A labelled placeholder screen with a "Back to menu" control. Used for surfaces that are
 * wired into navigation but not yet built (the Army Builder and Scenario screens land in
 * Part B; the Part-A match screen replaces its own stub in Step 4).
 */
export function ComingSoon({ title, note }: { readonly title: string; readonly note: string }) {
  const { navigate } = useNav();
  return (
    <div className="kt-coming-soon">
      <h1 className="kt-title">{title}</h1>
      <p className="kt-subtitle">{note}</p>
      <button type="button" className="kt-btn" onClick={() => navigate('menu')}>
        Back to menu
      </button>
    </div>
  );
}
