"use strict";

const puppeteer = require("puppeteer-core");
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
  return 55771;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = getActivePort();
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  const pages = await browser.pages();
  let ksPage = pages.find((p) => p.url().includes("kuaishou.com"));

  if (!ksPage) {
    console.error("未找到打开的快手页面，请确认页面是否已打开");
    return;
  }

  console.log("找到快手页面:", ksPage.url());

  // 1. 将封面卡片滚动到中央
  const scrollResult = await ksPage.evaluate(() => {
    const el = document.querySelector(
      '[class*="cover-full-editor"], [class*="default-cover"], [class*="high-cover-editor"]'
    );
    if (!el) return { ok: false, reason: "not-found" };
    el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    const rect = el.getBoundingClientRect();
    return {
      ok: true,
      tag: el.tagName,
      cls: el.className,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
  });
  console.log("滚动到封面卡片结果:", scrollResult);
  await sleep(1000);

  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  await ksPage.screenshot({ path: path.join(shotDir, "ks-debug-scrolled-to-cover.png") });
  console.log("📸 已保存滚动到封面卡片的截图: ks-debug-scrolled-to-cover.png");

  // 2. 统计点击前的顶级容器数量
  const countBefore = await ksPage.evaluate(() => document.body.children.length);

  // 3. 点击封面卡片
  console.log("正在点击封面卡片...");
  const clickInfo = await ksPage.evaluate(() => {
    const el = document.querySelector(
      '[class*="cover-full-editor"], [class*="default-cover"], [class*="high-cover-editor"]'
    );
    if (!el) return { ok: false };
    const target = el.querySelector("button, div, span") || el;
    target.click();
    return { ok: true, targetTag: target.tagName, targetCls: target.className };
  });
  console.log("点击封面卡片结果:", clickInfo);
  await sleep(2000);

  // 4. 分析点击后新增的 DOM 或者所有 fixed/absolute 浮层
  const overlayInfo = await ksPage.evaluate(() => {
    const overlays = [];
    for (const el of document.querySelectorAll("*")) {
      const style = window.getComputedStyle(el);
      if (
        (style.position === "fixed" || style.position === "absolute") &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        el.offsetWidth > 200 &&
        el.offsetHeight > 200
      ) {
        overlays.push({
          tag: el.tagName,
          id: el.id,
          cls: String(el.className).slice(0, 80),
          width: el.offsetWidth,
          height: el.offsetHeight,
          zIndex: style.zIndex,
          text: (el.textContent || "").slice(0, 100),
        });
      }
    }
    return overlays;
  });
  console.log("页面上所有浮层/弹窗:\n", JSON.stringify(overlayInfo, null, 2));

  await ksPage.screenshot({ path: path.join(shotDir, "ks-debug-after-click.png") });
  console.log("📸 已保存点击后的页面截图: ks-debug-after-click.png");
}

main().catch(console.error);
