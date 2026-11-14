// Vite resolves CSS imports at build time; jsdom cannot parse them, so tests map every
// stylesheet import to this empty module.
module.exports = {};
