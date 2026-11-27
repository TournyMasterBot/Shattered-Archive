// Import this FIRST in a test that needs the flagged build: shared modules read __SIMULACRUM_ADMIN_LOCAL__ once, when they are imported.
(globalThis as { __SIMULACRUM_ADMIN_LOCAL__?: boolean }).__SIMULACRUM_ADMIN_LOCAL__ = true;
export {};
