"use strict";

const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

function getActivePort() {
  const p = path.join(
    process.env.HOME,
    "Library/Application Support/matrix-video/DevToolsActivePort"
  );
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    return parseInt(lines[0], 10);
  }
  return 53116;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = getActivePort();
  console.log(`[test-ks] 连接调试端口: ${port}`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  // 1. 发起草稿任务，保持窗口打开
  const payload = JSON.stringify({
    platform: "ks",
    phone: "ai音乐",
    partition: "persist:ai音乐快手",
    file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
    cover: "/Users/jun10r/Pictures/142.JPG",
    coverPath: "/Users/jun10r/Pictures/142.JPG",
    title: "快手真实交互诊断",
    description: "快手真实交互诊断",
    draft: true,
    show: true,
    closeWindowAfterPublish: false,
  });

  console.log("🚀 发起发布草稿请求...");
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: 30088,
      path: "/publish",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => console.log("[test-ks] 接口响应:", data));
    }
  );
  req.write(payload);
  req.end();

  console.log("正在寻找快手页面...");
  let ksPage = null;
  for (let i = 0; i < 40; i++) {
    const pages = await browser.pages();
    for (const p of pages) {
      if (p.url().includes("kuaishou.com")) {
        ksPage = p;
        break;
      }
    }
    if (ksPage) break;
    await sleep(1000);
  }

  if (!ksPage) {
    console.error("❌ 未找到快手页面！");
    return;
  }

  console.log("✅ 成功连接到快手页面:", ksPage.url());

  // 监听浏览器控制台与请求失败
  ksPage.on("console", (msg) => {
    const txt = msg.text();
    if (txt.includes("cover") || txt.includes("cropper") || txt.includes("upload") || txt.includes("error") || txt.includes("Error") || txt.includes("warn")) {
      console.log(`[browser-console] ${msg.type()}: ${txt}`);
    }
  });

  ksPage.on("requestfailed", (req) => {
    console.warn(`[browser-request-failed] ${req.url()} (${req.failure()?.errorText})`);
  });

  ksPage.on("response", (res) => {
    const url = res.url();
    if (url.includes("upload") || url.includes("cover") || url.includes("image")) {
      console.log(`[browser-response] ${res.status()} ${url}`);
    }
  });

  // 等待发布完成或执行中
  console.log("正在持续监控页面状态 30 秒...");
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
  }
}

main().catch(console.error);
