/**
 * @shatteredarchive/scrum-poker-core — the isomorphic heart of Scrum Poker.
 *
 * Domain types, the `/ws/scrum` protocol contract, and every room state transition as a
 * pure function. Imported unchanged by both scrum-poker-server (which owns persistence,
 * transport and the clock) and scrum-poker-client (which renders the result), so the two
 * can never disagree about what a legal deck, a legal frame, or a hidden vote is.
 */

export * from './types.js';
export * from './deck.js';
export * from './room.js';
export * from './protocol.js';
