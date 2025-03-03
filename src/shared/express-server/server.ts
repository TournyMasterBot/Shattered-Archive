import "@shared/types/express-types/express";
import express, { Application, Request, Response } from "express";
import session from "express-session";
import cors from "cors";
import sessionIdMiddleware from "@shared/middleware/session.middleware";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerOptions from "@shared/swaggerOptions";
import cookieParser from "cookie-parser";
import { doubleCsrfProtection, generateToken } from "./middleware.csrf";
import ServerCache from "@shared/cache/server-cache";

export interface IShatteredServerProps {
  port: number;
  stage: string;
}

export interface IShatteredServer {
  port: number;

  GetServer(): Express.Application;
}

export class ShatteredServer implements IShatteredServer {
  public port: number;
  private server: Application;

  constructor(config: IShatteredServerProps) {
    this.port = config.port;
    const app = express();
    app.use(
      session({
        secret: ServerCache.jwtSecret, // use a strong secret in production
        resave: false,
        saveUninitialized: true, // creates a session even for non-authenticated users
        cookie: { secure: config.stage === "prod", maxAge: 24 * 60 * 60 * 1000 }, // 1 day
      }),
    );
    app.use(express.json());
    app.use(express.urlencoded({ extended: false })); // true: allow javascript objects to be expanded
    app.use(cookieParser());
    app.use(cors());
    app.use(sessionIdMiddleware);

    // Public endpoint to generate a CSRF token and set the corresponding cookie.
    // This route is unprotected so the frontend can retrieve a valid token.
    app.get("/security/get-csrf-token", (req: Request, res: Response) => {
      try {
        const token = generateToken(req, res);
        res.status(200).json({ token });
      } catch (err) {
        res.clearCookie("shatteredarchive.x-csrf-token", {
          path: "/",
          sameSite: "lax",
          secure: config.stage === "prod", // must match the cookie options when it was set
        });
        res.status(403).json({
          error: "csrf error",
          message: "A csrf error occurred",
        });
      }
    });

    if (config.stage !== "prod") {
      // Generate the swagger specification
      const specs = swaggerJsdoc(swaggerOptions);
      // Serve swagger docs on /api-docs
      app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
    }

    this.server = app;
  }

  public GetServer(): Application {
    return this.server;
  }
}

export default ShatteredServer;
