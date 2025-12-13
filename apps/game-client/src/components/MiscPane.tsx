import React from 'react';
import styles from '../styles/BottomPane.module.scss';
import { MiscSection, useMiscPane } from '../hooks/useMiscPane';

const Bestiary: React.FC = () => {
  return (
    <div className={styles.settingsSectionBody}>
      <h3 className={styles.settingsSectionTitle}>Bestiary</h3>
      <p className={styles.settingsSectionIntro}>
        Select a continent and area to open a detailed view of the creatures that inhabit it.
      </p>

      {/* Stub: later hook into your real continent/area data */}
      <div className={styles.settingsFieldRow}>
        <label className={styles.settingsFieldLabel}>
          Continent
          <select className={styles.settingsSelect} disabled>
            <option>Coming soon…</option>
          </select>
        </label>

        <label className={styles.settingsFieldLabel}>
          Area
          <select className={styles.settingsSelect} disabled>
            <option>Select a continent first…</option>
          </select>
        </label>
      </div>

      <p className={styles.settingsHint}>
        When implemented, clicking a creature link will open its entry in your creature archives.
      </p>
    </div>
  );
};

const Archives: React.FC = () => {
  return (
    <div className={styles.settingsSectionBody}>
      <h3 className={styles.settingsSectionTitle}>Archives</h3>
      <p className={styles.settingsSectionIntro}>
        Browse lore about continents, areas, notable items, and other discoveries from the Shattered Archive.
      </p>
      <ul className={styles.settingsBulletList}>
        <li>World overview and continent summaries.</li>
        <li>Area notes, recommended levels, travel tips.</li>
        <li>Item reference: quest items, legendaries, key drops.</li>
      </ul>
      <p className={styles.settingsHint}>
        This panel will eventually tie into your out-of-band “archives” backend or static data bundle.
      </p>
    </div>
  );
};

const Autopilot: React.FC = () => {
  return (
    <div className={styles.settingsSectionBody}>
      <h3 className={styles.settingsSectionTitle}>Autopilot</h3>
      <p className={styles.settingsSectionIntro}>
        Configure leveling routes per continent and area, and describe how the autopilot should behave.
      </p>

      <div className={styles.settingsFieldRow}>
        <label className={styles.settingsFieldLabel}>
          Continent
          <select className={styles.settingsSelect} disabled>
            <option>Coming soon…</option>
          </select>
        </label>

        <label className={styles.settingsFieldLabel}>
          Area
          <select className={styles.settingsSelect} disabled>
            <option>Select a continent first…</option>
          </select>
        </label>
      </div>

      <div className={styles.settingsFieldColumn}>
        <label className={styles.settingsFieldLabel}>
          Level range
          <input className={styles.settingsInput} type="text" placeholder="e.g. 30–35" disabled />
        </label>

        <label className={styles.settingsFieldLabel}>
          Notes
          <textarea
            className={styles.settingsTextarea}
            placeholder="Preferred mobs, danger zones, special rules…"
            disabled
          />
        </label>
      </div>

      <p className={styles.settingsHint}>Later this can read/write your real autopilot JSON definitions.</p>
    </div>
  );
};

const GameLog: React.FC = () => {
  return (
    <div className={styles.settingsSectionBody}>
      <h3 className={styles.settingsSectionTitle}>Log</h3>
      <p className={styles.settingsSectionIntro}>
        Control which events are written to disk, and how log files are rotated.
      </p>

      <div className={styles.settingsFieldColumn}>
        <label className={styles.settingsCheckboxRow}>
          <input type="checkbox" disabled />
          Text output (room descriptions, combat spam, tells)
        </label>
        <label className={styles.settingsCheckboxRow}>
          <input type="checkbox" disabled />
          GMCP traffic (room, affects, char status)
        </label>
        <label className={styles.settingsCheckboxRow}>
          <input type="checkbox" disabled />
          System events (connect/disconnect, errors, warnings)
        </label>
      </div>

      <div className={styles.settingsFieldRow}>
        <label className={styles.settingsFieldLabel}>
          Rotation
          <select className={styles.settingsSelect} disabled>
            <option>Disabled (single rolling log)</option>
            <option>Per session</option>
            <option>Per day</option>
          </select>
        </label>

        <label className={styles.settingsFieldLabel}>
          Max file size
          <input className={styles.settingsInput} type="text" placeholder="e.g. 10 MB" disabled />
        </label>
      </div>

      <p className={styles.settingsHint}>
        Stub-only for now; wiring will pipe events through your existing logging utilities.
      </p>
    </div>
  );
};

const renderSection = (section: MiscSection) => {
  switch (section) {
    case 'bestiary':
      return <Bestiary />;
    case 'archives':
      return <Archives />;
    case 'autopilot':
      return <Autopilot />;
    case 'log':
      return <GameLog />;
    default:
      return null;
  }
};

export const MiscPane: React.FC = () => {
  const { activeSection, setActiveSection } = useMiscPane();

  return (
    <div className={styles.settingsRoot}>
      {/* Left-side nav */}
      <nav className={styles.settingsSidebar} aria-label="Settings sections">
        <button
          type="button"
          className={`${styles.settingsNavItem} ${activeSection === 'bestiary' ? styles.settingsNavItemActive : ''}`}
          onClick={() => setActiveSection('bestiary')}
        >
          Bestiary
        </button>

        <button
          type="button"
          className={`${styles.settingsNavItem} ${activeSection === 'archives' ? styles.settingsNavItemActive : ''}`}
          onClick={() => setActiveSection('archives')}
        >
          Archives
        </button>

        <button
          type="button"
          className={`${styles.settingsNavItem} ${activeSection === 'autopilot' ? styles.settingsNavItemActive : ''}`}
          onClick={() => setActiveSection('autopilot')}
        >
          Autopilot
        </button>

        <button
          type="button"
          className={`${styles.settingsNavItem} ${activeSection === 'log' ? styles.settingsNavItemActive : ''}`}
          onClick={() => setActiveSection('log')}
        >
          Log
        </button>
      </nav>

      {/* Right-side content */}
      <section className={styles.settingsContent}>{renderSection(activeSection)}</section>
    </div>
  );
};

export default MiscPane;
