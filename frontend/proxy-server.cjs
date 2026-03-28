/**
 * Simple proxy+static server for Rumi frontend.
 * Serves dist/ for static assets, proxies /api /ws /analyze /storage to FastAPI backend.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const net = require("net");

const BACKEND_HOST = "localhost";
const BACKEND_PORT = 8000;
const SERVE_PORT = process.env.PORT || 8080;
const DIST_DIR = path.join(__dirname, "dist");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

// Proxy paths to backend
const PROXY_PREFIXES = ["/api/", "/ws/", "/analyze/", "/storage/", "/health"];

function shouldProxy(url) {
  return PROXY_PREFIXES.some((p) => url.startsWith(p));
}

function proxyRequest(req, res) {
  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (e) => {
    console.error("Proxy error:", e.message);
    res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(proxyReq, { end: true });
}

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  let filePath = path.join(DIST_DIR, urlPath);

  // Try exact file first
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback
  const indexPath = path.join(DIST_DIR, "index.html");
  res.writeHead(200, { "Content-Type": "text/html" });
  fs.createReadStream(indexPath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (shouldProxy(req.url)) {
    proxyRequest(req, res);
  } else {
    serveStatic(req, res);
  }
});

// WebSocket upgrade for /ws/
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/ws/")) {
    const backendSocket = net.connect(BACKEND_PORT, BACKEND_HOST, () => {
      backendSocket.write(
        `GET ${req.url} HTTP/1.1\r\nHost: ${BACKEND_HOST}:${BACKEND_PORT}\r\n` +
          Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\r\n") +
          "\r\n\r\n"
      );
    });
    socket.pipe(backendSocket);
    backendSocket.pipe(socket);
    socket.on("error", () => backendSocket.destroy());
    backendSocket.on("error", () => socket.destroy());
  } else {
    socket.destroy();
  }
});

server.listen(SERVE_PORT, "0.0.0.0", () => {
  console.log(`Rumi proxy server listening on http://0.0.0.0:${SERVE_PORT}`);
  console.log(`  Static files: ${DIST_DIR}`);
  console.log(`  Backend proxy: http://${BACKEND_HOST}:${BACKEND_PORT}`);
});
