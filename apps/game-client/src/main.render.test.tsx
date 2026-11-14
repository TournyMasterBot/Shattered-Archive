// The app entry renders the app inside StrictMode once the connection-id migration has finished (and not before).
import React from 'react';

let resolveMigration: () => void = () => undefined;
const render = jest.fn();
const createRoot = jest.fn(() => ({ render }));
jest.mock('./features/connection/connectionIdMigrationBoot', () => ({
  connectionIdMigrationReady: new Promise<void>((resolve) => {
    resolveMigration = resolve;
  }),
}));
jest.mock('./App', () => ({ App: () => null }));
jest.mock('react-dom/client', () => ({ createRoot: () => createRoot(), default: { createRoot: () => createRoot() } }));
jest.mock('./styles/Global.module.scss', () => ({}), { virtual: true });

describe('src/main: rendering', () => {
  it('renders the app in StrictMode after the migration, not before', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(render).not.toHaveBeenCalled();

    resolveMigration();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(render).toHaveBeenCalledTimes(1);
    const tree = render.mock.calls[0][0] as React.ReactElement;
    expect(tree.type).toBe(React.StrictMode);
  });
});
