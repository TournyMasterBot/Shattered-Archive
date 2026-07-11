import {
  createGameDataProvider,
  createGameModeProvider,
  type EngineProviders,
} from '@shatteredarchive/kingdom-tactics-engine';

/**
 * The single, app-wide {@link EngineProviders} bundle. The engine is stateless data +
 * pure functions, so one shared instance is safe for the whole client — every screen
 * (menu, match, later the builder/scenario) reads game data and modes through this.
 *
 * The client NEVER re-implements rules, costs, or deployment: it feeds this bundle into
 * `buildMatch`, `applyAction`, `legalActions`, and the AI policies.
 */
export const providers: EngineProviders = {
  data: createGameDataProvider(),
  modes: createGameModeProvider(),
};
