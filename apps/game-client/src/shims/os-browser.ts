// apps/game-client/src/shims/os-browser.ts

// Minimal browser shim for Node's `os` module,
// just enough to keep Fengari happy.

export function platform(): string {
  // Fengari mostly uses this to toggle path / line ending behavior.
  // "linux" is a safe, POSIX-y default for browser.
  return 'linux';
}

export function tmpdir(): string {
  return '/tmp';
}

export function homedir(): string {
  return '/';
}

export const EOL = '\n';

// Some bundlers / codepaths use the default export style.
export default {
  platform,
  tmpdir,
  homedir,
  EOL,
};
