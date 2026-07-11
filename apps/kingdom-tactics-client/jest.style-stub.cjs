// Jest stub for CSS/asset imports — components import stylesheets for Vite, but jsdom
// cannot parse them, so under test they resolve to this empty module.
module.exports = {};
