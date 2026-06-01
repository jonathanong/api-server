import { Application } from "./src/application.mts";
import http from "node:http";

const app = new Application();
app.route("/").get((ctx) => {
  ctx.json({ ok: true });
});

const server = http.createServer(app.callback()).listen(3000, () => {
  const req = http.request({
    port: 3000,
    path: 'http://[/foo',
    method: 'GET'
  }, (res) => {
    console.log("Status:", res.statusCode);
    res.on('data', (d) => console.log(d.toString()));
    server.close();
  });
  req.on('error', (e) => console.error(e));
  req.end();
});
