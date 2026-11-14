import { describeStartupError, startServer } from './bootstrap.js';

startServer(process.env).catch((error: unknown) => {
  console.error(describeStartupError(error));
  process.exit(1);
});
