// react-router needs TextEncoder and TextDecoder, which jsdom does not provide: take Node's.
const { TextDecoder, TextEncoder } = require('node:util');
Object.assign(globalThis, { TextDecoder, TextEncoder });
