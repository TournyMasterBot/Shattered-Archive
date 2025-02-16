import express, { Application } from "express";
import cors from "cors";

export interface IShatteredServerProps {
  port: number;
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
    this.server = app;
  }

  public GetServer(): Application {
    return this.server;
  }
}

export default ShatteredServer;
