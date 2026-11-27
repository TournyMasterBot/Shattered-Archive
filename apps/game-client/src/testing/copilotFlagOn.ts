// Import this FIRST in a test that needs the flagged build: MainContainer reads __COPILOT_LOCAL__ once, when it is imported.
(globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = true;
export {};
