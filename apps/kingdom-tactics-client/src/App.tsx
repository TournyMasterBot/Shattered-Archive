import { NavProvider, useNav } from './state/nav';
import { MainMenu } from './pages/MainMenu';
import { MatchScreen } from './features/match';
import { ArmyBuilderScreen } from './features/army-builder';
import { ScenarioScreen } from './features/scenario';
import { SimulatorScreen } from './features/simulator';
import { OnlineMatchScreen } from './features/net';
import { AccountScreen, useAuthCallback } from './features/auth';

/**
 * App shell for the Kingdom Tactics client. Wraps the screen router in the nav store and
 * renders exactly one full-screen surface at a time (no router lib in v1). All gameplay
 * comes from `@shatteredarchive/kingdom-tactics-engine`; the client is render + interaction.
 */

function ScreenRouter() {
  const { state } = useNav();
  switch (state.screen) {
    case 'menu':
      return <MainMenu />;
    case 'match':
      return <MatchScreen />;
    case 'army-builder':
      return <ArmyBuilderScreen />;
    case 'scenario':
      return <ScenarioScreen />;
    case 'simulator':
      return <SimulatorScreen />;
    case 'online':
      return <OnlineMatchScreen />;
    case 'account':
      return <AccountScreen />;
    default:
      return <MainMenu />;
  }
}

export function App() {
  useAuthCallback();
  return (
    <NavProvider>
      <div className="kt-shell">
        <ScreenRouter />
      </div>
    </NavProvider>
  );
}
