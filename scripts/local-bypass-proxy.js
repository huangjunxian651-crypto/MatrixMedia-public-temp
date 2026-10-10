"use strict";

const http = require("http");
const net = require("net");
const os = require("os");

function getEn0Ip() {
  const ifaces = os.networkInterfaces();
  const en0 = ifaces["en0"] || [];
  for (const item of en0) {
    if (item.family === "IPv4" && !item.internal) {
      return item.address;
    }
  }
  return "192.168.1.85";
}

const LOCAL_IP = getEn0Ip();
const PORT = 18899;

const server = http.createServer((req, res) => {
  const url = new URL(req.url);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: req.method,
    headers: req.headers,
    localAddress: LOCAL_IP,
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
});

server.on("connect", (req, clientSocket, head) => {
  const [host, port] = req.url.split(":");
  const targetPort = parseInt(port, 10) || 443;

  const serverSocket = net.connect(
    {
      host: host,
      port: targetPort,
      localAddress: LOCAL_IP,
    },
    () => {
      clientSocket.write(
        "HTTP/1.1 200 Connection Established\r\nProxy-agent: Node-Proxy\r\n\r\n"
      );
      if (head && head.length) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    }
  );

  serverSocket.on("error", (err) => {
    clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    clientSocket.end();
  });

  clientSocket.on("error", () => {
    serverSocket.destroy();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[proxy] 本地直连代理已就绪: http://127.0.0.1:${PORT} (绑定网卡 ${LOCAL_IP})`);
});
