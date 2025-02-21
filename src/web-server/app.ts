import LoadRoutes from "@shared/express-server/middleware.route";
import ShatteredServer from "@shared/express-server/server";
import ServerCache from "cache/server-cache";
import path from "path";

(async function main() {
  let port = 8080;
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

  // Load the server cache (using await inside an async function)
  await ServerCache.Initialize({
    serviceName: "web-server",
    gameCache: {
      initializeAreas: true,
      initializeDamageTypes: false,
      initializeAbilities: false,
      initializeAbilityGroups: false,
      initializeRaces: true,
      initializeClasses: true,
      initializeItems: true,
    }
  });

  // Start the server
  const shatteredServer = new ShatteredServer({ 
    port,
    stage: execEnv
  });
  const app = shatteredServer.GetServer();

  const routesDirectory = path.join(__dirname, "routes");
  LoadRoutes(app, routesDirectory);

  app.listen(port, () => {
    console.log(`Shattered Archive Web Server is running in ${execEnv} mode on http://localhost:${port}`);
  });
})();
