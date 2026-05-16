import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveTrustedClientIp } from "../src/trusted-client-ip.mts";

Deno.test("resolves IP from Deno.serve Request and ServeHandlerInfo", async () => {
  const server = Deno.serve(
    {
      hostname: "127.0.0.1",
      port: 0,
      onListen() {},
    },
    (request, info) => {
      const ip = resolveTrustedClientIp({
        request,
        remoteAddress: info.remoteAddr,
      });
      return Response.json({ ip });
    },
  );

  try {
    const response = await fetch(`http://${server.addr.hostname}:${server.addr.port}`, {
      headers: {
        "x-forwarded-for": "203.0.113.10:12345, 10.0.0.1",
      },
    });
    assertEquals(await response.json(), { ip: "203.0.113.10" });
  } finally {
    await server.shutdown();
  }
});

Deno.test("falls back to Deno remote address when trusted headers are blank", () => {
  const ip = resolveTrustedClientIp({
    request: new Request("http://localhost", {
      headers: { "cf-connecting-ip": "", "x-forwarded-for": " " },
    }),
    remoteAddress: { hostname: "198.51.100.20", port: 54321 },
  });

  assertEquals(ip, "198.51.100.20");
});
