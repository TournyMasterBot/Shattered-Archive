// Simulator feature slice — headless AI-vs-AI batch dashboard over the engine sim/.
export { SimulatorScreen } from './SimulatorScreen';
export { runSimBatch } from './sim-runner';
export type { SimConfig, SimSummary, PolicyKind } from './sim-runner';
export { useSimBatch } from './hooks/useSimBatch';
