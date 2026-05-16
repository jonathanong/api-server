import { createServer, type Server, type RequestListener } from "node:http";

/**
 * Creates an HTTP server from the given request listener, runs the provided
 * function with that server, and ensures the server is fully closed afterwards.
 *
 * Supertest's `request(app.callback())` creates/destroys a TCP server per call
 * without waiting for full cleanup, causing flaky "socket hang up" and spurious
 * 500 errors under CI load. This helper avoids that by:
 * - Binding to 127.0.0.1 (avoids EPERM on 0.0.0.0 in restricted environments)
 * - Handling listen errors via the server 'error' event
 * - Force-closing all connections before server.close() to prevent hangs
 */
export async function withServer(
  callback: RequestListener,
  fn: (server: Server) => Promise<void>,
): Promise<void> {
  const server = createServer(callback);
  // Disable keep-alive so connections close immediately after each response,
  // preventing server.close() from hanging on idle keep-alive sockets.
  server.keepAliveTimeout = 0;
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    await fn(server);
  } finally {
    // Force-close all connections so server.close() resolves immediately
    // instead of waiting for idle keep-alive sockets to time out.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
