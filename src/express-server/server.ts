import express from 'express';
import cors from 'cors';

export interface IShatteredServer {
    port: number

    GetServer(): Express.Application;
}

class ShatteredServer implements IShatteredServer {
    public port: number;
    private server: Express.Application;

    constructor(config: IShatteredServer) {
        this.port = config.port;
        const app = express();
        app.use(express.json());
        app.use(cors());
        this.server = app;
    }

    public GetServer(): Express.Application {
        return this.server;
    }
}

export default ShatteredServer;