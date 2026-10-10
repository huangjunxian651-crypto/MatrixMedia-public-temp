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
  return 55771;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  fs.mkdirSync(shotDir, { recursive: true });

  const port = getActivePort();
  console.log(`[debug-ks] 连接调试端口: ${port}`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  console.log("🚀 发起快手草稿任务...");
  const payload = JSON.stringify({
    platform: "ks",
    phone: "ai音乐",
    partition: "persist:ai音乐快手",
    file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
    cover: "/Users/jun10r/Pictures/142.JPG",
    coverPath: "/Users/jun10r/Pictures/142.JPG",
    title: "快手封面逐步调试",
    description: "快手封面逐步调试",
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
      res.on("end", () => console.log("[debug-ks] 接口响应:", data));
    }
  );
  req.write(payload);
  req.end();

  console.log("[debug-ks] 正在等待快手发布页面打开...");
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
    console.error("[debug-ks] ❌ 未找到快手页面！");
    return;
  }

  console.log("[debug-ks] 找到快手页面:", ksPage.url());

  // 等待视频上传并进入编辑状态
  console.log("[debug-ks] 等待视频上传与转码完成...");
  for (let i = 0; i < 60; i++) {
    const hasVideo = await ksPage.evaluate(() => {
      return !!document.querySelector("#preview-tours video, video, .video-preview");
    });
    if (hasVideo) {
      console.log("[debug-ks] ✅ 视频组件已渲染！");
      break;
    }
    await sleep(1000);
  }

  // 滚动到顶部，确保封面区域完全可见
  await ksPage.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await sleep(1000);

  // 截图 1: 视频上传后的发布页面全貌（包含封面展示位）
  const shot1 = path.join(shotDir, "ks-step1-publish-page.png");
  await ksPage.screenshot({ path: shot1 });
  console.log("📸 [步骤1已截图] 视频上传后的发布页面全貌:", shot1);

  // 详细分析页面上所有与封面相关的元素
  const coverElements = await ksPage.evaluate(() => {
    const results = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const text = (el.textContent || "").trim();
      const cls = String(el.className || "");
      if (
        (text.includes("封面") || cls.includes("cover") || el.getAttribute("aria-label")?.includes("封面")) &&
        text.length < 30 &&
        el.children.length <= 2
      ) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            tag: el.tagName,
            text,
            cls,
            id: el.id,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          });
        }
      }
    }
    return results;
  });

  console.log("[debug-ks] 找到封面相关候选元素:\n", JSON.stringify(coverElements, null, 2));

  // 尝试点击封面设置入口
  const clicked = await ksPage.evaluate(() => {
    // 寻找最精准的封面触发按钮
    const candidates = document.querySelectorAll(
      '[class*="cover"] button, [class*="cover"] [role="button"], button[class*="cover"], [class*="edit-cover"], [class*="cover-preview"], [class*="cover-box"]'
    );
    for (const c of candidates) {
      const rect = c.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        c.click();
        return { ok: true, tag: c.tagName, cls: c.className, text: c.textContent };
      }
    }

    // 备选：查找包含「设置封面」或「更换封面」或「编辑封面」的按钮
    for (const el of document.querySelectorAll("button, span, div")) {
      const t = (el.textContent || "").trim();
      if (t === "设置封面" || t === "更换封面" || t === "编辑封面" || t === "选择封面") {
        el.click();
        return { ok: true, tag: el.tagName, cls: el.className, text: t };
      }
    }
    return { ok: false };
  });

  console.log("[debug-ks] 点击封面入口结果:", clicked);
  await sleep(1500);

  // 截图 2: 点击封面入口后的弹窗或操作界面
  const shot2 = path.join(shotDir, "ks-step2-cover-modal.png");
  await ksPage.screenshot({ path: shot2 });
  console.log("📸 [步骤2已截图] 封面弹窗或操作界面:", shot2);

  // 分析弹窗内的元素（Tabs、上传按钮、比例选项等）
  const modalInfo = await ksPage.evaluate(() => {
    const modal = document.querySelector(".ant-modal, [class*='modal'], [class*='drawer'], [role='dialog']") || document.body;
    const tabs = [];
    for (const t of modal.querySelectorAll('[role="tab"], .ant-tabs-tab, [class*="tab"]')) {
      const text = (t.textContent || "").trim();
      if (text) tabs.push(text);
    }
    const buttons = [];
    for (const b of modal.querySelectorAll("button, [role='button'], .ant-btn")) {
      const text = (b.textContent || "").trim();
      if (text) buttons.push(text);
    }
    const radios = [];
    for (const r of modal.querySelectorAll(".ant-radio-button-wrapper, .ant-radio-wrapper, [class*='radio']")) {
      const text = (r.textContent || "").trim();
      if (text) radios.push(text);
    }
    const fileInputs = [];
    for (const inp of modal.querySelectorAll('input[type="file"]')) {
      fileInputs.push({ accept: inp.accept, name: inp.name });
    }
    return { tabs, buttons, radios, fileInputs };
  });

  console.log("[debug-ks] 弹窗内部组件信息:\n", JSON.stringify(modalInfo, null, 2));

  // 步骤 3: 切换到上传封面 Tab
  const switched = await ksPage.evaluate(() => {
    const modal = document.querySelector(".ant-modal, [class*='modal'], [role='dialog']") || document.body;
    for (const el of modal.querySelectorAll("div, span, button, [role='tab'], .ant-tabs-tab")) {
      const text = (el.textContent || "").trim();
      if (text === "上传封面" || text === "本地上传" || text === "上传图片" || text.includes("上传封面")) {
        el.click();
        return { ok: true, text };
      }
    }
    return { ok: false };
  });
  console.log("[debug-ks] 切换上传Tab结果:", switched);
  await sleep(1000);

  // 截图 3: 切换到上传封面 Tab 后的界面
  const shot3 = path.join(shotDir, "ks-step3-upload-tab.png");
  await ksPage.screenshot({ path: shot3 });
  console.log("📸 [步骤3已截图] 切换到上传封面 Tab 后的界面:", shot3);

  // 步骤 4: 注入本地封面图片
  const coverPath = "/Users/jun10r/Pictures/142.JPG";
  console.log(`[debug-ks] 准备注入本地图片: ${coverPath}`);

  // 寻找弹窗内的 input[type="file"]
  let uploadInput = await ksPage.$('.ant-modal input[type="file"], [role="dialog"] input[type="file"]');
  if (!uploadInput) {
    uploadInput = await ksPage.$('input[type="file"][accept*="image"]');
  }
  if (!uploadInput) {
    // 点击上传区域唤醒
    await ksPage.evaluate(() => {
      const area = document.querySelector('.ant-modal [class*="upload"], [role="dialog"] [class*="upload"]');
      if (area) area.click();
    });
    await sleep(500);
    uploadInput = await ksPage.$('.ant-modal input[type="file"], [role="dialog"] input[type="file"], input[type="file"][accept*="image"]');
  }

  if (uploadInput) {
    await uploadInput.uploadFile(coverPath);
    console.log("[debug-ks] ✅ uploadInput.uploadFile 注入成功！");
  } else {
    console.warn("[debug-ks] ⚠️ 未找到弹窗内的 input[type='file']，尝试 DataTransfer 注入...");
  }

  // HTML5 DataTransfer 注入
  const fileBase64 = fs.readFileSync(coverPath).toString("base64");
  const fileName = path.basename(coverPath);
  await ksPage.evaluate(({ b64, name }) => {
    try {
      const bStr = atob(b64);
      const u8arr = new Uint8Array(bStr.length);
      for (let i = 0; i < bStr.length; i++) u8arr[i] = bStr.charCodeAt(i);
      const file = new File([u8arr], name, { type: "image/jpeg" });
      const modal = document.querySelector(".ant-modal, [class*='modal'], [role='dialog']") || document.body;
      for (const inp of modal.querySelectorAll('input[type="file"]')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (e) {
      console.warn("DOM DataTransfer 注入异常:", e);
    }
  }, { b64: fileBase64, name: fileName });

  console.log("[debug-ks] 等待 2.5 秒图片上传与裁剪渲染...");
  await sleep(2500);

  // 截图 4: 图片上传后裁剪渲染状态
  const shot4 = path.join(shotDir, "ks-step4-crop-view.png");
  await ksPage.screenshot({ path: shot4 });
  console.log("📸 [步骤4已截图] 图片上传后裁剪渲染状态:", shot4);

  // 步骤 5: 寻找并选中 4:3 比例
  const ratioClicked = await ksPage.evaluate(() => {
    const modal = document.querySelector(".ant-modal, [class*='modal'], [role='dialog']") || document.body;
    for (const el of modal.querySelectorAll(".ant-radio-button-wrapper, .ant-radio-wrapper, button, span, label, div")) {
      const text = (el.textContent || "").trim();
      if (text === "4:3" || text.includes("4:3")) {
        el.click();
        return { ok: true, text };
      }
    }
    return { ok: false };
  });
  console.log("[debug-ks] 选择 4:3 比例结果:", ratioClicked);
  await sleep(800);

  // 截图 5: 选中 4:3 比例后的状态
  const shot5 = path.join(shotDir, "ks-step5-ratio-selected.png");
  await ksPage.screenshot({ path: shot5 });
  console.log("📸 [步骤5已截图] 选中 4:3 比例后的状态:", shot5);

  // 步骤 6: 点击确定/完成保存封面
  const confirmClicked = await ksPage.evaluate(() => {
    const modal = document.querySelector(".ant-modal, [class*='modal'], [role='dialog']") || document.body;
    for (const b of modal.querySelectorAll(".ant-btn-primary, button.ant-btn-primary, button")) {
      const text = (b.textContent || "").trim();
      if (text === "确定" || text === "完成" || text === "保存") {
        b.click();
        return { ok: true, text };
      }
    }
    return { ok: false };
  });
  console.log("[debug-ks] 点击完成/确定按钮:", confirmClicked);
  await sleep(1500);

  // 截图 6: 封面保存后的发布页最终状态
  const shot6 = path.join(shotDir, "ks-step6-confirmed-page.png");
  await ksPage.screenshot({ path: shot6 });
  console.log("📸 [步骤6已截图] 封面保存后的发布页最终状态:", shot6);

  console.log("🎉 快手全流程调试与步骤截图录制完毕！");
}

main().catch(console.error);
