import { useState } from 'react';

import type { ExternalRef, SnippetKind } from './api/client.js';
import AreasPage from './features/areas/AreasPage.js';
import RoomsPage from './features/rooms/RoomsPage.js';
import MobsPage from './features/mobs/MobsPage.js';
import ObjectsPage from './features/objects/ObjectsPage.js';
import ResetsPage from './features/resets/ResetsPage.js';
import ScriptsPage from './features/scripts/ScriptsPage.js';
import SocialsPage from './features/socials/SocialsPage.js';
import SkillsPage from './features/skills/SkillsPage.js';
import WorldPage from './features/world/WorldPage.js';
import MapPage from './features/map/MapPage.js';
import AccessPage from './features/auth/AccessPage.js';
import EnginePage from './features/engine/EnginePage.js';
import RolesPage from './features/roles/RolesPage.js';
import ContentPage from './features/content/ContentPage.js';
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
  | 'access'
  | 'roles'
  | 'content'
  | 'engine';

const SECTION_BY_SNIPPET_KIND: Record<SnippetKind, BuilderSection> = {
  room: 'rooms',
  mob: 'mobs',
  object: 'objects',
  script: 'scripts',
};

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
  { id: 'roles', label: 'Roles' },
  { id: 'content', label: 'My Content' },
  { id: 'engine', label: 'Engine' },
];

export default function App() {
  const [section, setSection] = useState<BuilderSection>('areas');
  // Cross-page target: a World-dashboard link lands on the Areas tab with this open.
  const [areaTarget, setAreaTarget] = useState<ExternalRef | null>(null);
  // Cross-page target: a RoomEditor "see what spawns here" link lands on the Resets tab filtered to this room (Phase 13).
  const [resetsRoomTarget, setResetsRoomTarget] = useState<{ vnum: number } | null>(null);
  // Cross-page target: a Map room click, Areas' "Edit this room" link, or Simulate's reverse
  // link all land on the Rooms tab (the room editor) with that room selected.
  const [roomsTarget, setRoomsTarget] = useState<ExternalRef | null>(null);
  // Cross-page target: a blocked room delete's "Go fix it on the Map" button lands on the
  // Map tab with that room focused/highlighted.
  const [mapFocus, setMapFocus] = useState<{ file: string; vnum: number } | null>(null);
  // Cross-page target: My Content's "Load into editor" lands on the matching tab (Rooms/
  // Mobs/Objects/Scripts), seeding a brand-new entity from the snippet's saved data.
  const [contentLoad, setContentLoad] = useState<{ kind: SnippetKind; data: unknown } | null>(null);

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
          <AreasPage
            initialTarget={areaTarget}
            onOpenSpawn={(vnum) => {
              setResetsRoomTarget({ vnum });
              setSection('resets');
            }}
            onGoToResets={(vnum) => {
              setResetsRoomTarget({ vnum });
              setSection('resets');
            }}
            onGoToMap={(vnum, file) => {
              setMapFocus({ file, vnum });
              setSection('map');
            }}
            onGoToMobs={() => setSection('mobs')}
            onGoToScripts={() => setSection('scripts')}
          />
        ) : section === 'rooms' ? (
          <RoomsPage
            initialTarget={roomsTarget}
            pendingSnippet={contentLoad}
            onOpenSpawn={(vnum) => {
              setResetsRoomTarget({ vnum });
              setSection('resets');
            }}
            onGoToResets={(vnum) => {
              setResetsRoomTarget({ vnum });
              setSection('resets');
            }}
            onGoToMap={(vnum, file) => {
              setMapFocus({ file, vnum });
              setSection('map');
            }}
            onGoToMobs={() => setSection('mobs')}
            onGoToScripts={() => setSection('scripts')}
          />
        ) : section === 'mobs' ? (
          <MobsPage
            pendingSnippet={contentLoad}
            onGoToResets={() => setSection('resets')}
            onGoToScripts={() => setSection('scripts')}
          />
        ) : section === 'objects' ? (
          <ObjectsPage
            pendingSnippet={contentLoad}
            onGoToResets={() => setSection('resets')}
            onGoToMap={() => setSection('map')}
          />
        ) : section === 'resets' ? (
          <ResetsPage
            initialRoomTarget={resetsRoomTarget}
            onEditRoom={(vnum, file) => {
              setRoomsTarget({ kind: 'room', vnum, where: 'resets', file, name: '' });
              setSection('rooms');
            }}
          />
        ) : section === 'scripts' ? (
          <ScriptsPage pendingSnippet={contentLoad} />
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
            initialFocus={mapFocus}
            onOpenRoom={(ref) => {
              setRoomsTarget(ref);
              setSection('rooms');
            }}
          />
        ) : section === 'access' ? (
          <AccessPage />
        ) : section === 'roles' ? (
          <RolesPage />
        ) : section === 'content' ? (
          <ContentPage
            onLoad={(kind, data) => {
              setContentLoad({ kind, data });
              setSection(SECTION_BY_SNIPPET_KIND[kind]);
            }}
          />
        ) : section === 'engine' ? (
          <EnginePage />
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
