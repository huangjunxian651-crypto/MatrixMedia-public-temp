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
  console.log(`[test-dy] 连接调试端口: ${port}`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  // 发起抖音草稿任务
  const payload = JSON.stringify({
    platform: "dy",
    phone: "ai音乐",
    partition: "persist:ai音乐抖音",
    file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
    cover: "/Users/jun10r/Pictures/142.JPG",
    coverPath: "/Users/jun10r/Pictures/142.JPG",
    title: "抖音4:3横封面完整端到端验证",
    description: "抖音4:3横封面完整端到端验证",
    draft: true,
    show: true,
    closeWindowAfterPublish: false,
  });

  console.log("🚀 发起发布抖音草稿请求...");
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
      res.on("end", () => {
        console.log("[test-dy] 接口响应:", data);
        setTimeout(() => {
          console.log("[test-dy] 测试已完成，主动退出进程。");
          process.exit(0);
        }, 15000);
      });
    }
  );
  req.write(payload);
  req.end();

  console.log("正在寻找抖音页面...");
  let dyPage = null;
  for (let i = 0; i < 40; i++) {
    const pages = await browser.pages();
    for (const p of pages) {
      if (p.url().includes("douyin.com")) {
        dyPage = p;
        break;
      }
    }
    if (dyPage) break;
    await sleep(1000);
  }

  if (!dyPage) {
    console.error("❌ 未找到抖音页面！");
    return;
  }

  console.log("✅ 成功连接到抖音页面:", dyPage.url());

  // 监听浏览器控制台与请求失败
  dyPage.on("console", (msg) => {
    const txt = msg.text();
    if (txt.includes("cover") || txt.includes("cropper") || txt.includes("upload") || txt.includes("error") || txt.includes("Error") || txt.includes("warn")) {
      console.log(`[browser-console] ${msg.type()}: ${txt}`);
    }
  });

  dyPage.on("response", (res) => {
    const url = res.url();
    if (url.includes("upload") || url.includes("cover") || url.includes("image")) {
      console.log(`[browser-response] ${res.status()} ${url}`);
    }
  });

  console.log("正在持续监控抖音页面状态 40 秒...");
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
  }
}

main().catch(console.error);
