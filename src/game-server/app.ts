import http from 'http';
import ShatteredServer from '@shared/express-server/server';

let port = 3001;
let execEnv = 'dev';

// Log all command-line arguments
console.log("Process arguments:", process.argv);

// Parse the '--port' flag
const portFlagIndex = process.argv.indexOf('--port');
if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
  port = parseInt(process.argv[portFlagIndex + 1], 10);
  if (isNaN(port)) {
    console.error("Invalid port number provided.");
    process.exit(1);
  }
}

// Parse the '--execEnv' flag
const execEnvFlagIndex = process.argv.indexOf('--execEnv');
if (execEnvFlagIndex !== -1 && process.argv[execEnvFlagIndex + 1]) {
  execEnv = process.argv[execEnvFlagIndex + 1];
}

const shatteredServer = new ShatteredServer({
  port: port
})
const app = shatteredServer.GetServer();

app.get('/', (req, res) => {
  res.send('Hello, Game Server!');
});

app.listen(port, () => {
  console.log(`Shattered Archive Game Server is running in ${execEnv} mode on http://localhost:${port}`);
});