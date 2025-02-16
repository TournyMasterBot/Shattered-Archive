import "@shared/types/express-types/express";
import express, { Application } from "express";
import cors from "cors";
import sessionIdMiddleware from "@shared/middleware/session.middleware";
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerOptions from "@shared/swaggerOptions";

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
    app.use(express.json());
    app.use(cors());
    app.use(sessionIdMiddleware);

    if(config.stage !== "prod" && config.stage !== "production") {
      // Generate the swagger specification
      const specs = swaggerJsdoc(swaggerOptions);
      // Serve swagger docs on /api-docs
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    }

    this.server = app;
  }

  public GetServer(): Application {
    return this.server;
  }
}

export default ShatteredServer;
