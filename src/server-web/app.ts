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

console.log(`Server starting in ${execEnv} mode on port: ${port}`);

const requestListener = (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, Web!');
};

const server = http.createServer(requestListener);

server.listen(port, () => {
  console.log(`Shattered Archive Web Server is running in ${execEnv} mode on http://localhost:${port}`);
});