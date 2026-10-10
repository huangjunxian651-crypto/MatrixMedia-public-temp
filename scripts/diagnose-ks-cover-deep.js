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
  return 55039;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = getActivePort();
  console.log(`[ks-deep] 连接 Electron 调试端口: ${port}`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  console.log("[ks-deep] 准备向 MatrixMedia 发送快手草稿任务 (带 4:3 封面)...");
  const payload = JSON.stringify({
    platform: "ks",
    phone: "ai音乐",
    partition: "persist:ai音乐快手",
    file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
    cover: "/Users/jun10r/Pictures/142.JPG",
    coverPath: "/Users/jun10r/Pictures/142.JPG",
    title: "快手深度封面诊断",
    description: "快手深度封面诊断",
    draft: true,
    show: true,
    closeWindowAfterPublish: false,
  });

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
      res.on("end", () => console.log("[ks-deep] MatrixMedia 响应:", data));
    }
  );
  req.write(payload);
  req.end();

  console.log("[ks-deep] 等待快手页面出现...");
  let ksPage = null;
  for (let i = 0; i < 60; i++) {
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
    console.error("[ks-deep] ❌ 未找到快手页面！");
    return;
  }

  console.log("[ks-deep] ✅ 已锁定快手页面:", ksPage.url());

  // 监听所有网络请求，特别是封面上传与作品发布/保存
  ksPage.on("request", (r) => {
    const u = r.url();
    if (
      u.includes("publish") ||
      u.includes("works") ||
      u.includes("cover") ||
      u.includes("upload") ||
      u.includes("image") ||
      u.includes("material") ||
      u.includes("draft")
    ) {
      console.log(`\n➡️ [REQUEST] ${r.method()} ${u}`);
      const postData = r.postData();
      if (postData) {
        console.log(`   [POST-DATA] ${postData.slice(0, 500)}`);
      }
    }
  });

  ksPage.on("response", async (res) => {
    const u = res.url();
    if (
      u.includes("publish") ||
      u.includes("works") ||
      u.includes("cover") ||
      u.includes("material") ||
      u.includes("draft")
    ) {
      console.log(`\n⬅️ [RESPONSE] ${res.status()} ${u}`);
      try {
        const text = await res.text();
        console.log(`   [BODY] ${text.slice(0, 500)}`);
      } catch (_) {}
    }
  });

  // 持续观察 60 秒
  console.log("[ks-deep] 持续监控页面状态与网络请求 60 秒...");
  for (let s = 0; s < 60; s++) {
    await sleep(1000);
  }

  console.log("[ks-deep] 诊断观察结束。");
}

main().catch(console.error);
