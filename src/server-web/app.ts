// app.ts
import http from 'http';

const port = 3000;

const requestListener = (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, Web!');
};

const server = http.createServer(requestListener);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
