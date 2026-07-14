import { useState } from 'react';

import AreasPage from './features/areas/AreasPage.js';
import MobsPage from './features/mobs/MobsPage.js';
import ObjectsPage from './features/objects/ObjectsPage.js';
import ScriptsPage from './features/scripts/ScriptsPage.js';
import './App.css';

export type BuilderSection = 'areas' | 'rooms' | 'mobs' | 'objects' | 'scripts';

const SECTIONS: { id: BuilderSection; label: string }[] = [
  { id: 'areas', label: 'Areas' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'mobs', label: 'Mobs' },
  { id: 'objects', label: 'Objects' },
  { id: 'scripts', label: 'Scripts' },
];

export default function App() {
  const [section, setSection] = useState<BuilderSection>('areas');

  return (
    <div className="mb-app">
      <header className="mb-header">
        <h1>MUD Builder</h1>
        <nav className="mb-nav" aria-label="Builder sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'mb-nav-item mb-nav-item--active' : 'mb-nav-item'}
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mb-main">
        {section === 'areas' ? (
          <AreasPage />
        ) : section === 'mobs' ? (
          <MobsPage />
        ) : section === 'objects' ? (
          <ObjectsPage />
        ) : section === 'scripts' ? (
          <ScriptsPage />
        ) : (
          <p className="mb-placeholder">
            {SECTIONS.find((s) => s.id === section)?.label} — dedicated editor coming in a later
            phase (rooms are editable now via Areas).
          </p>
        )}
      </main>
    </div>
  );
}
