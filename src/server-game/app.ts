// app.ts
import http from 'http';

const port = 3001;

const requestListener = (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, Game Server!');
};

const server = http.createServer(requestListener);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
