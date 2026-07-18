import { useState } from 'react';

import type { ExternalRef } from './api/client.js';
import AreasPage from './features/areas/AreasPage.js';
import MobsPage from './features/mobs/MobsPage.js';
import ObjectsPage from './features/objects/ObjectsPage.js';
import ResetsPage from './features/resets/ResetsPage.js';
import ScriptsPage from './features/scripts/ScriptsPage.js';
import SocialsPage from './features/socials/SocialsPage.js';
import SkillsPage from './features/skills/SkillsPage.js';
import WorldPage from './features/world/WorldPage.js';
import MapPage from './features/map/MapPage.js';
import AccessPage from './features/auth/AccessPage.js';
import './App.css';

export type BuilderSection =
  | 'areas'
  | 'rooms'
  | 'mobs'
  | 'objects'
  | 'resets'
  | 'scripts'
  | 'socials'
  | 'skills'
  | 'world'
  | 'map'
  | 'access';

const SECTIONS: { id: BuilderSection; label: string }[] = [
  { id: 'areas', label: 'Areas' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'mobs', label: 'Mobs' },
  { id: 'objects', label: 'Objects' },
  { id: 'resets', label: 'Resets' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'socials', label: 'Socials' },
  { id: 'skills', label: 'Skills' },
  { id: 'world', label: 'World' },
  { id: 'map', label: 'Map' },
  { id: 'access', label: 'Access' },
];

export default function App() {
  const [section, setSection] = useState<BuilderSection>('areas');
  // Cross-page target: a World-dashboard link lands on the Areas tab with this open.
  const [areaTarget, setAreaTarget] = useState<ExternalRef | null>(null);

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
          <AreasPage initialTarget={areaTarget} />
        ) : section === 'mobs' ? (
          <MobsPage />
        ) : section === 'objects' ? (
          <ObjectsPage />
        ) : section === 'resets' ? (
          <ResetsPage />
        ) : section === 'scripts' ? (
          <ScriptsPage />
        ) : section === 'socials' ? (
          <SocialsPage />
        ) : section === 'skills' ? (
          <SkillsPage />
        ) : section === 'world' ? (
          <WorldPage
            onOpenArea={(ref) => {
              setAreaTarget(ref);
              setSection('areas');
            }}
          />
        ) : section === 'map' ? (
          <MapPage
            onOpenRoom={(ref) => {
              setAreaTarget(ref);
              setSection('areas');
            }}
          />
        ) : section === 'access' ? (
          <AccessPage />
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
