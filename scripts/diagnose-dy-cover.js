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
  return 51990;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = getActivePort();
  console.log(`[diag-dy] 连接调试端口: ${port}`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  // 发起抖音任务，保持窗口打开
  const payload = JSON.stringify({
    platform: "dy",
    phone: "ai音乐",
    partition: "persist:ai音乐抖音",
    file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
    title: "抖音封面DOM诊断",
    description: "抖音封面DOM诊断",
    draft: true,
    show: true,
    closeWindowAfterPublish: false,
  });

  console.log("🚀 发起发布抖音请求...");
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
      res.on("end", () => console.log("[diag-dy] 接口响应:", data));
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

  // 等待视频上传并出现设置封面模块
  console.log("等待视频转码并呈现设置封面模块...");
  for (let i = 0; i < 60; i++) {
    const hasCoverArea = await dyPage.evaluate(() => {
      const text = document.body.innerText || "";
      return text.includes("横封面4:3") || text.includes("设置封面");
    });
    if (hasCoverArea) {
      console.log("✅ 检测到设置封面模块！");
      break;
    }
    await sleep(1000);
  }

  await sleep(2000);

  // 诊断封面区域所有元素
  const domInfo = await dyPage.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll("*")) {
      const text = (el.textContent || "").trim();
      if (
        (text.includes("横封面4:3") || text.includes("竖封面3:4") || text === "设置封面") &&
        text.length < 50
      ) {
        const rect = el.getBoundingClientRect();
        results.push({
          tag: el.tagName,
          cls: el.className,
          text: text,
          rect: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
        });
      }
    }
    return results;
  });

  console.log("【诊断结果】封面区域匹配元素：\n", JSON.stringify(domInfo, null, 2));

  // 截图当前封面区域
  await dyPage.screenshot({
    path: "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots/dy-diag-cards.png",
  });
  console.log("📸 已保存封面卡片诊断截图: dy-diag-cards.png");
}

main().catch(console.error);
