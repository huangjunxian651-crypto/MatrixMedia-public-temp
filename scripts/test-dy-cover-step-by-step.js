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
  return 50496;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  fs.mkdirSync(shotDir, { recursive: true });

  const port = getActivePort();
  console.log(`[test-dy] 连接调试端口: ${port}`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  const payload = JSON.stringify({
    platform: "dy",
    phone: "ai音乐",
    partition: "persist:ai音乐抖音",
    file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
    // 故意不传 cover，由本脚本接管自动化操作和每一步截图！
    title: "抖音4:3横封面自动化全流程调试",
    description: "抖音4:3横封面自动化全流程调试",
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
      res.on("end", () => console.log("[test-dy] 接口响应:", data));
    }
  );
  req.write(payload);
  req.end();

  console.log("正在等待抖音页面...");
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
    process.exit(1);
  }

  console.log("✅ 成功连接到抖音页面:", dyPage.url());

  // 等待视频上传并进入发布页面（出现设置封面）
  console.log("等待视频上传完成并出现设置封面模块...");
  for (let i = 0; i < 60; i++) {
    const ready = await dyPage.evaluate(() => {
      if (!document.body) return false;
      const text = document.body.innerText || "";
      return text.includes("横封面4:3") || text.includes("设置封面");
    }).catch(() => false);
    if (ready) {
      console.log("✅ 检测到发布页面及封面区域就绪！");
      break;
    }
    await sleep(1000);
  }

  await sleep(1500);

  // 1. 关闭任何气泡遮罩（如「我知道了」）
  await dyPage.evaluate(() => {
    for (const btn of document.querySelectorAll("button, div, span")) {
      const t = (btn.textContent || "").trim();
      if (t === "我知道了") {
        btn.click();
      }
    }
  });
  await sleep(500);

  // 滚动到顶部使封面区域完全可见
  await dyPage.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await sleep(500);

  // 步骤 0: 截取发布页全貌
  await dyPage.screenshot({ path: path.join(shotDir, "dy-step0-entry.png") });
  console.log("📸 [步骤0已保存] 发布页初始全貌: dy-step0-entry.png");

  // 2. 精准定位并点击「横封面4:3」卡片
  const clickedCard = await dyPage.evaluate(() => {
    // 找到包含 "横封面4:3" 的文本标签
    for (const el of document.querySelectorAll("*")) {
      const t = (el.textContent || "").trim();
      if (t === "横封面4:3" && el.children.length === 0) {
        // 其上方相邻或父容器内的卡片区域
        const parent = el.closest('[class*="card"], [class*="item"], div');
        if (parent) {
          const card = parent.querySelector('[class*="cover"], [class*="box"], [class*="preview"], img, div');
          if (card) {
            const r = card.getBoundingClientRect();
            if (r.width > 20 && r.height > 20) {
              return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), name: "横封面卡片" };
            }
          }
        }
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top - 40), name: "横封面文字上方卡片" };
      }
    }
    return null;
  });

  if (clickedCard) {
    console.log(`点击目标: ${clickedCard.name} @ (${clickedCard.x}, ${clickedCard.y})`);
    await dyPage.mouse.click(clickedCard.x, clickedCard.y);
  } else {
    console.log("尝试备选点击选择封面...");
    await dyPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("*")).filter(
        (el) => (el.textContent || "").trim() === "选择封面" && el.children.length === 0
      );
      if (btns.length > 1) {
        btns.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
        btns[0].click(); // 右侧卡片
      } else if (btns.length === 1) {
        btns[0].click();
      }
    });
  }

  // 等待模态弹窗出现
  await dyPage.waitForSelector(".semi-modal-body, .semi-modal, [class*='modal']", {
    visible: true,
    timeout: 10000,
  });
  await sleep(1500);

  // 步骤 1: 弹窗打开后截图
  await dyPage.screenshot({ path: path.join(shotDir, "dy-step1-modal-opened.png") });
  console.log("📸 [步骤1已保存] 封面编辑弹窗打开: dy-step1-modal-opened.png");

  // 3. 在弹窗内明确切换到「设置横封面」Tab
  console.log("正在切换至【设置横封面】Tab...");
  const tabSwitched = await dyPage.evaluate(() => {
    const modal = document.querySelector(".semi-modal-body, .semi-modal") || document;
    // 优先顶部 Tab: "设置横封面"
    for (const el of modal.querySelectorAll("div, span, button, [role='tab'], .semi-tabs-tab")) {
      const t = (el.textContent || "").trim();
      if (t === "设置横封面" && el.children.length === 0) {
        el.click();
        return { ok: true, text: t, via: "top-tab" };
      }
    }
    // 备选底部按钮: "设置横封面"
    for (const el of modal.querySelectorAll("button, .semi-button")) {
      const t = (el.textContent || "").trim();
      if (t === "设置横封面") {
        el.click();
        return { ok: true, text: t, via: "bottom-btn" };
      }
    }
    return { ok: false };
  });
  console.log("切换结果:", tabSwitched);
  await sleep(1500);

  // 步骤 2: 切换到设置横封面Tab截图
  await dyPage.screenshot({ path: path.join(shotDir, "dy-step2-tab-switched.png") });
  console.log("📸 [步骤2已保存] 已切换到设置横封面: dy-step2-tab-switched.png");

  // 4. 定位并上传封面图片
  const coverPath = "/Users/jun10r/Pictures/142.JPG";
  console.log("正在注入封面图片文件:", coverPath);

  // 找到封面上传的 input[type="file"]
  let inputHandle = await dyPage.$('.semi-modal input[type="file"]');
  if (!inputHandle) {
    inputHandle = await dyPage.$('input[type="file"][accept*="image"]');
  }

  if (!inputHandle) {
    // 点击「+ 上传封面」按钮唤起 input
    await dyPage.evaluate(() => {
      const modal = document.querySelector(".semi-modal") || document;
      for (const el of modal.querySelectorAll("button, div, span")) {
        const t = (el.textContent || "").trim();
        if (t.includes("上传封面") && el.children.length === 0) {
          el.click();
          break;
        }
      }
    });
    await sleep(800);
    inputHandle = await dyPage.$('.semi-modal input[type="file"]') || await dyPage.$('input[type="file"][accept*="image"]');
  }

  if (inputHandle) {
    await inputHandle.uploadFile(coverPath);
    console.log("✅ 成功通过 inputHandle 上传文件！");
  } else {
    console.error("❌ 未找到 input[type=file]！");
  }

  // 给足等待时间让图片上传与裁剪框出现
  console.log("等待 6 秒图片上传与裁剪弹窗渲染...");
  await sleep(6000);

  // 步骤 3: 注入图片并显示裁剪界面截图
  await dyPage.screenshot({ path: path.join(shotDir, "dy-step3-image-injected.png") });
  console.log("📸 [步骤3已保存] 封面图片裁剪界面: dy-step3-image-injected.png");

  // 5. 在裁剪弹窗中点击「保存」按钮
  console.log("正在保存裁剪封面...");
  const cropSaved = await dyPage.evaluate(() => {
    // 裁剪弹窗可能是一个更小的子模态框或在当前 modal 内
    // 优先寻找高亮的「保存」红色/主色按钮
    const btns = Array.from(document.querySelectorAll("button, .semi-button"));
    for (const b of btns) {
      const t = (b.textContent || "").trim();
      if (t === "保存") {
        b.click();
        return { ok: true, text: t };
      }
    }
    return { ok: false };
  });
  console.log("裁剪保存结果:", cropSaved);
  await sleep(2000);

  // 步骤 4: 裁剪保存后截图（横封面预览已展示蜘蛛侠）
  await dyPage.screenshot({ path: path.join(shotDir, "dy-step4-ratio-selected.png") });
  console.log("📸 [步骤4已保存] 裁剪完成并更新预览: dy-step4-ratio-selected.png");

  // 6. 点击主模态框的「完成」按钮以保存全部封面
  console.log("正在点击主模态框【完成】按钮...");
  const mainModalDone = await dyPage.evaluate(() => {
    const modal = document.querySelector(".semi-modal-body, .semi-modal") || document;
    const btns = Array.from(modal.querySelectorAll("button, .semi-button"));
    for (const b of btns) {
      const t = (b.textContent || "").trim();
      if (t === "完成" || t === "确定") {
        if (!b.disabled && !b.className.includes("disabled")) {
          b.click();
          return { ok: true, text: t };
        }
      }
    }
    // 兜底尝试点击最后一个 primary 按钮
    const primaries = modal.querySelectorAll(".semi-button-primary");
    if (primaries.length > 0) {
      const last = primaries[primaries.length - 1];
      last.click();
      return { ok: true, text: last.textContent, fallback: true };
    }
    return { ok: false };
  });
  console.log("主模态框完成结果:", mainModalDone);
  await sleep(3000);

  // 等待模态框彻底关闭
  for (let i = 0; i < 10; i++) {
    const isClosed = await dyPage.evaluate(() => {
      const m = document.querySelector(".semi-modal, .semi-modal-mask");
      return !m || m.offsetParent === null || m.style.display === "none";
    });
    if (isClosed) {
      console.log("✅ 弹窗已完全关闭！");
      break;
    }
    await sleep(600);
  }

  // 给足同步等待时间 5 秒
  console.log("等待 5 秒抖音主页面完全同步数据...");
  await sleep(5000);

  // 步骤 5: 最终主页面截图（确认「横封面4:3」卡片已呈现蜘蛛侠）
  await dyPage.screenshot({ path: path.join(shotDir, "dy-step5-cover-confirmed.png") });
  console.log("📸 [步骤5已保存] 主页面横封面已确认生效: dy-step5-cover-confirmed.png");

  console.log("🎉 自动化流程全部完成！15秒后退出。");
  setTimeout(() => process.exit(0), 15000);
}

main().catch((err) => {
  console.error("执行出错:", err);
  process.exit(1);
});
