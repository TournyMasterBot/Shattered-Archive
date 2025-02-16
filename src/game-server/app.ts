import http from "http";
import ShatteredServer from "@shared/express-server/server";
import path from "path";
import LoadRoutes from "@shared/express-server/middleware.route";

let port = 3001;
let execEnv = "dev";

// Log all command-line arguments
console.log("Process arguments:", process.argv);

// Parse the '--port' flag
const portFlagIndex = process.argv.indexOf("--port");
if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
  port = parseInt(process.argv[portFlagIndex + 1], 10);
  if (isNaN(port)) {
    console.error("Invalid port number provided.");
    process.exit(1);
  }
}

// Parse the '--execEnv' flag
const execEnvFlagIndex = process.argv.indexOf("--execEnv");
if (execEnvFlagIndex !== -1 && process.argv[execEnvFlagIndex + 1]) {
  execEnv = process.argv[execEnvFlagIndex + 1];
}

const shatteredServer = new ShatteredServer({
  port: port,
});
const app = shatteredServer.GetServer();

const routesDirectory = path.join(__dirname, "routes");
LoadRoutes(app, routesDirectory);

app.listen(port, () => {
  console.log(
    `Shattered Archive Game Server is running in ${execEnv} mode on http://localhost:${port}`,
  );
});
