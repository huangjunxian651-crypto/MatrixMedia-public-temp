"use strict";

const { app, BrowserWindow } = require("electron");
const puppeteerCore = require("puppeteer-core");
const pie = require("puppeteer-in-electron");
const path = require("path");
const fs = require("fs");

const VIDEO_FILE = "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4";
const COVER_FILE = "/Users/jun10r/Pictures/142.JPG";
const OUT_DIR = path.resolve(__dirname, "../temp-cover-inspect");

fs.mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  console.log("🚀 开始真实页面探查流程...");
  let browser = null;
  try {
    browser = await pie.connect(app, puppeteerCore);
  } catch (e) {
    console.error("pie.connect 失败:", e);
    app.quit();
    return;
  }

  // 1. 探查快手 (Kuaishou)
  async function inspectKuaishou() {
    console.log("\n=================== 探查快手 ===================");
    const win = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
      webPreferences: {
        partition: "persist:ai音乐快手",
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    const page = await pie.getPage(browser, win);
    console.log("[ks] 正在导航至快手创作者中心...");
    await page.goto("https://cp.kuaishou.com/article/publish/video?tabType=1", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(3000);

    // 检查是否在发布页
    console.log("[ks] 当前 URL:", page.url());
    // 注入视频
    const fileInput = await page.$('input[type="file"][accept*="video"]');
    if (!fileInput) {
      console.log("[ks] 未找到视频上传 input，保存当前截图");
      await page.screenshot({ path: path.join(OUT_DIR, "ks-no-input.png") });
      win.close();
      return;
    }
    console.log("[ks] 注入测试视频...");
    await fileInput.uploadFile(VIDEO_FILE);

    // 等待上传和封面按钮
    console.log("[ks] 等待封面编辑入口出现 (最多 60 秒)...");
    let coverBtnFound = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      coverBtnFound = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button, span, div, a")) {
          const t = (el.textContent || "").trim();
          if (t === "编辑封面" || t === "设置封面" || t === "更换封面") {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (coverBtnFound) break;
    }

    if (!coverBtnFound) {
      console.log("[ks] 超时未找到编辑封面按钮，截图");
      await page.screenshot({ path: path.join(OUT_DIR, "ks-wait-cover-fail.png") });
      win.close();
      return;
    }

    console.log("[ks] 已点击封面编辑入口，等待弹窗...");
    await sleep(2000);

    // 点击上传封面 Tab
    await page.evaluate(() => {
      const modal = document.querySelector(".ant-modal, [class*='modal']") || document;
      for (const el of modal.querySelectorAll("div, span, button, [role='tab']")) {
        const t = (el.textContent || "").trim();
        if (t === "上传封面" || t === "上传图片" || t.includes("上传封面")) {
          el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1000);

    // 寻找弹窗内的 file input 注入图片
    const coverInput = await page.$('.ant-modal input[type="file"], input[type="file"][accept*="image"]');
    if (coverInput) {
      console.log("[ks] 注入封面图片...");
      await coverInput.uploadFile(COVER_FILE);
      await sleep(3000);
    }

    // 抓取弹窗内的所有 DOM 元素信息
    const ksModalInfo = await page.evaluate(() => {
      const modal = document.querySelector(".ant-modal, [class*='modal']") || document;
      const buttons = [...modal.querySelectorAll("button, [role='button'], .ant-radio-button-wrapper, [class*='ratio'], [class*='tab']")].map((b) => ({
        tag: b.tagName,
        text: (b.textContent || "").trim(),
        className: b.className,
      }));
      return { buttons, html: modal.innerHTML.slice(0, 3000) };
    });

    console.log("[ks] 弹窗内按钮与选项:", JSON.stringify(ksModalInfo.buttons, null, 2));
    await page.screenshot({ path: path.join(OUT_DIR, "ks-cover-modal.png") });
    win.close();
  }

  // 2. 探查抖音 (Douyin)
  async function inspectDouyin() {
    console.log("\n=================== 探查抖音 ===================");
    const win = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
      webPreferences: {
        partition: "persist:ai音乐抖音",
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    const page = await pie.getPage(browser, win);
    console.log("[dy] 正在导航至抖音创作者中心...");
    await page.goto("https://creator.douyin.com/creator-micro/content/upload", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(3000);

    console.log("[dy] 当前 URL:", page.url());
    const fileInput = await page.$('input[type="file"][accept*="video"]');
    if (!fileInput) {
      console.log("[dy] 未找到视频 input，截图");
      await page.screenshot({ path: path.join(OUT_DIR, "dy-no-input.png") });
      win.close();
      return;
    }
    console.log("[dy] 注入测试视频...");
    await fileInput.uploadFile(VIDEO_FILE);

    console.log("[dy] 等待封面入口出现 (最多 60 秒)...");
    let coverBtnFound = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      coverBtnFound = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button, div, span, p")) {
          const t = (el.textContent || "").replace(/\s+/g, "").trim();
          if (t === "设置封面" || t === "选择封面" || t === "更换封面") {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (coverBtnFound) break;
    }

    if (!coverBtnFound) {
      console.log("[dy] 超时未找到封面入口，截图");
      await page.screenshot({ path: path.join(OUT_DIR, "dy-wait-cover-fail.png") });
      win.close();
      return;
    }

    console.log("[dy] 已点击封面入口，等待弹窗...");
    await sleep(2000);

    // 切换到上传封面 Tab
    await page.evaluate(() => {
      const modal = document.querySelector(".semi-modal-body, .semi-modal") || document;
      for (const el of modal.querySelectorAll("div, span, button, [role='tab'], .semi-tabs-tab")) {
        const t = (el.textContent || "").trim();
        if (t === "上传封面" || t.includes("上传封面")) {
          el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1000);

    // 注入图片
    const coverInput = await page.$('.semi-modal input[type="file"], input[type="file"][accept*="image"]');
    if (coverInput) {
      console.log("[dy] 注入封面图片...");
      await coverInput.uploadFile(COVER_FILE);
      await sleep(3000);
    }

    // 抓取弹窗内按钮与选项
    const dyModalInfo = await page.evaluate(() => {
      const modal = document.querySelector(".semi-modal-body, .semi-modal") || document;
      const buttons = [...modal.querySelectorAll("button, [role='button'], [class*='ratio'], [class*='tab'], .semi-radio, [role='radio'], span, div")].filter(
        (b) => b.children.length === 0 && (b.textContent || "").trim().length > 0 && (b.textContent || "").trim().length < 15
      ).map((b) => ({
        tag: b.tagName,
        text: (b.textContent || "").trim(),
        className: b.className,
      }));
      return { buttons, html: modal.innerHTML.slice(0, 3000) };
    });

    console.log("[dy] 弹窗内文本选项:", JSON.stringify(dyModalInfo.buttons.slice(0, 40), null, 2));
    await page.screenshot({ path: path.join(OUT_DIR, "dy-cover-modal.png") });
    win.close();
  }

  try {
    await inspectKuaishou();
    await inspectDouyin();
  } catch (err) {
    console.error("探查出错:", err);
  } finally {
    console.log("探查结束，退出应用");
    app.quit();
  }
});
