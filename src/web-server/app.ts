import ShatteredServer from '@shared/express-server/server';
import http from 'http';

let port = 8080;
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
  res.send('Hello, Web Server!');
});

app.listen(port, () => {
  console.log(`Shattered Archive Web Server is running in ${execEnv} mode on http://localhost:${port}`);
});