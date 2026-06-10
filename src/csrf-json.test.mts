import { test, expect } from "vitest";
import http from "node:http";
import request from "supertest";
import { Application } from "../src/application.mts";

test("json() parses unconditionally, leading to CSRF preflight bypass", async () => {
  const app = new Application();
  app.route("/transfer").post(async (ctx) => {
    const body = await ctx.request.json<{ amount: number }>();
    ctx.json({ success: true, amount: body.amount });
  });

  const server = http.createServer(app.callback());

  // Attacker sends request with text/plain (no preflight required by browser)
  const res = await request(server)
    .post("/transfer")
    .set("Content-Type", "text/plain") // Browsers allow this cross-origin without preflight!
    .send('{"amount": 9999}');

  // Since we're sending text/plain, it should be rejected with 415 to prevent JSON CSRF.
  expect(res.status).toBe(415);
  expect(res.text).toBe("Unsupported Media Type");

  // Valid JSON requests should still work
  const res2 = await request(server)
    .post("/transfer")
    .set("Content-Type", "application/json")
    .send('{"amount": 9999}');

  expect(res2.status).toBe(200);
  expect(res2.body).toEqual({ success: true, amount: 9999 });
});
