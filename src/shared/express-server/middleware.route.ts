import express, { Application, Express } from 'express';
import fs from 'fs';
import path from 'path';


/**
 * Recursively loads and registers route middleware.
 *
 * @param app - The Express app instance.
 * @param dir - The directory to search for route files.
 * @param baseRoute - The accumulated base route (derived from the folder structure).
 */
function LoadRoutes(app: Application, dir: string, baseRoute: string = ''): void {
    // Read all items (files and directories) in the current directory.
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Recursively load routes from subdirectories.
            // Append the directory name to the base route.
            const newBase = path.join(baseRoute, item).replace(/\\/g, '/');
            LoadRoutes(app, fullPath, newBase);
        } else {
            const routeModule = require(fullPath);
            const router = routeModule.default || routeModule.router;

            // If the module exports a "path", use it; otherwise, use the derived baseRoute.
            const routePath = routeModule.path || ('/' + baseRoute);

            if (router) {
                app.use(routePath, router);
                console.log(`Registered route: [${routePath}] from ${fullPath}`);
            } else {
                console.warn(`No router exported from ${fullPath}`);
            }
        }
    });
}

export default LoadRoutes;