"use strict";

const http = require("http");
const net = require("net");
const os = require("os");

let serverInstance = null;
let boundIp = null;
const PROXY_PORT = 18899;

function getPhysicalIpv4() {
  const ifaces = os.networkInterfaces();
  for (const name of ["en0", "en1", "eth0", "wlan0"]) {
    const list = ifaces[name] || [];
    for (const item of list) {
      if (item.family === "IPv4" && !item.internal && item.address) {
        return item.address;
      }
    }
  }
  for (const name of Object.keys(ifaces)) {
    if (name.startsWith("utun") || name.startsWith("tun") || name.startsWith("tap")) continue;
    const list = ifaces[name] || [];
    for (const item of list) {
      if (item.family === "IPv4" && !item.internal && item.address) {
        return item.address;
      }
    }
  }
  return null;
}

export function ensureLocalBypassProxy() {
  if (serverInstance) {
    return `http://127.0.0.1:${PROXY_PORT}`;
  }

  boundIp = getPhysicalIpv4();
  if (!boundIp) {
    return null;
  }

  try {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url);
        const options = {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers: req.headers,
          localAddress: boundIp,
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on("error", (err) => {
          res.writeHead(502);
          res.end("Bad Gateway: " + err.message);
        });

        req.pipe(proxyReq, { end: true });
      } catch (e) {
        res.writeHead(400);
        res.end("Bad Request");
      }
    });

    server.on("connect", (req, clientSocket, head) => {
      const [host, port] = req.url.split(":");
      const targetPort = parseInt(port, 10) || 443;

      const serverSocket = net.connect(
        {
          host: host,
          port: targetPort,
          localAddress: boundIp,
        },
        () => {
          clientSocket.write(
            "HTTP/1.1 200 Connection Established\r\nProxy-agent: MatrixMedia-Bypass\r\n\r\n"
          );
          if (head && head.length) serverSocket.write(head);
          serverSocket.pipe(clientSocket);
          clientSocket.pipe(serverSocket);
        }
      );

      serverSocket.on("error", () => {
        try {
          clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
          clientSocket.end();
        } catch (_) {}
      });

      clientSocket.on("error", () => {
        try {
          serverSocket.destroy();
        } catch (_) {}
      });
    });

    server.listen(PROXY_PORT, "127.0.0.1");
    serverInstance = server;
    console.log(`[bypass-proxy] 已启动国内平台物理网卡直连代理: http://127.0.0.1:${PROXY_PORT} (绑定物理网卡 IP: ${boundIp})`);
    return `http://127.0.0.1:${PROXY_PORT}`;
  } catch (err) {
    console.warn("[bypass-proxy] 启动直连代理失败:", err?.message || err);
    return null;
  }
}
