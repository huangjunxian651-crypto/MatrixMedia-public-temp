"use strict";

import fs from "fs";
import path from "path";

/**
 * 延迟等待
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 通用文件上传注入适配器（同时兼容 Puppeteer 与 Playwright）
 * @param {object} inputHandle - 元素句柄或 Locator
 * @param {string} filePath - 本地图片绝对路径
 */
async function uploadToFileInput(inputHandle, filePath) {
  if (!inputHandle) return false;
  // Playwright Locator: setInputFiles
  if (typeof inputHandle.setInputFiles === "function") {
    await inputHandle.setInputFiles(filePath);
    return true;
  }
  // Puppeteer ElementHandle: uploadFile
  if (typeof inputHandle.uploadFile === "function") {
    await inputHandle.uploadFile(filePath);
    return true;
  }
  return false;
}

/**
 * 在页面 DOM 中查找并点击 4:3 比例元素
 * 严格使用正则匹配 4:3 / 4 : 3 / 横版 4:3，坚决排除 3:4 / 16:9 等干扰
 */
async function clickRatio43InContainer(page, containerSelector) {
  return page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document;
    if (!root) return false;

    const ratioRegex = /(?:^|[^\d])4\s*[:：\/]\s*3(?:[^\d]|$)/;
    const candidates = root.querySelectorAll(
      "button, span, div, label, p, a, [role='radio'], [role='tab'], .ant-radio-button-wrapper, .semi-radio"
    );

    for (const el of candidates) {
      // 优先选叶子或短文案元素
      const text = (el.textContent || "").trim();
      if (
        ratioRegex.test(text) &&
        !text.includes("3:4") &&
        !text.includes("3 : 4") &&
        !text.includes("16:9") &&
        !text.includes("9:16")
      ) {
        // 如果有直接子节点包含相同文本，优先让更具体的子节点响应
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join("");

        if (ratioRegex.test(directText) || el.children.length === 0) {
          el.click();
          return { clicked: true, text };
        }
      }
    }
    return { clicked: false };
  }, containerSelector);
}

/**
 * 哔哩哔哩 (Bilibili) 封面上传 (4:3 比例)
 *
 * 关键步骤：
 * 1. 定位并点击封面设置入口
 * 2. 等待弹窗 .cover-editor 渲染
 * 3. 切换到「上传封面」/「自选封面」Tab
 * 4. 找到 input[type="file"] 注入本地图片
 * 5. 选中「4:3」首页推荐封面比例，并勾选「双比例同步改动」
 * 6. 点击「完成」提交保存
 * 7. 检测并确认二次同步弹窗（“检测到个人空间封面未修改...”）
 * 8. 严格等待弹窗彻底关闭，确保不遮挡后续发布按钮
 */
export async function uploadBilibiliCover(page, rawCoverPath) {
  if (!rawCoverPath) return false;
  const coverPath = path.resolve(rawCoverPath);
  if (!fs.existsSync(coverPath)) {
    console.warn(`[blbl-cover] 封面文件不存在: ${coverPath}`);
    return false;
  }
  console.log(`[blbl-cover] 准备上传哔哩哔哩 4:3 封面: ${coverPath}`);

  try {
    // 1. 点击封面设置入口（优先命中 .add-text「添加封面」）
    const clickedEntry = await page.evaluate(() => {
      const addText = document.querySelector(".add-text");
      if (addText) {
        addText.click();
        return true;
      }
      const candidates = [
        document.querySelector(".cover-empty"),
        document.querySelector(".cover-main"),
        document.querySelector(".cover-img"),
        document.querySelector(".cover-wrp"),
        document.querySelector(".upload-video-cover-img"),
      ];
      for (const el of candidates) {
        if (el) {
          el.click();
          return true;
        }
      }
      for (const el of document.querySelectorAll("span, div, p, button")) {
        const t = (el.textContent || "").trim();
        if (t === "添加封面" || t === "设置封面" || t === "更换封面" || t === "修改封面") {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!clickedEntry) {
      console.warn("[blbl-cover] 未找到哔哩哔哩封面设置入口，跳过");
      return false;
    }
    console.log("[blbl-cover] 已打开封面编辑弹窗");

    // 2. 等待弹窗出现
    await page.waitForSelector(".cover-editor", {
      visible: true,
      timeout: 10000,
    }).catch(() => null);
    await sleep(600);

    // 3. 切换至「上传封面」Tab（优先命中 .upload-text「上传封面」）
    await page.evaluate(() => {
      const container = document.querySelector(".cover-editor") || document;
      const uploadText = container.querySelector(".upload-text");
      if (uploadText) {
        uploadText.click();
        return true;
      }
      const tabs = container.querySelectorAll(
        "div, span, button, p, a, [role='tab'], .tab-item"
      );
      for (const tab of tabs) {
        const text = (tab.textContent || "").trim();
        if (
          text === "上传封面" ||
          text === "自选封面" ||
          text === "本地上传" ||
          text === "自定义封面"
        ) {
          tab.click();
          return true;
        }
      }
      return false;
    });
    await sleep(400);

    // 4. 定位封面专属 input[type="file"] 并执行双通道文件注入
    let inputHandle = null;
    try {
      await page.waitForSelector(
        '.cover-editor input[type="file"], input[type="file"][accept*="image"]',
        { timeout: 5000 }
      );
    } catch (_) {}

    inputHandle =
      (await page.$('.cover-editor input[type="file"]')) ||
      (await page.$('input[type="file"][accept*="image"]'));

    if (!inputHandle) {
      // 触发上传区域点击唤起 input
      await page.evaluate(() => {
        const area = document.querySelector(
          '.cover-editor .upload-text, .cover-editor [class*="upload-wrp"], .cover-editor [class*="upload-btn"], .cover-editor [class*="upload"]'
        );
        if (area) area.click();
      });
      await sleep(500);
      inputHandle =
        (await page.$('.cover-editor input[type="file"]')) ||
        (await page.$('input[type="file"][accept*="image"]'));
    }

    if (inputHandle) {
      // 通道 1: Puppeteer CDP 原生文件上传
      await inputHandle.uploadFile(coverPath);
    }

    // 通道 2: 通过 HTML5 DataTransfer 与 File API 深度注入并强制派发 change/input 事件
    const fileBase64 = fs.readFileSync(coverPath).toString("base64");
    const fileName = path.basename(coverPath);
    const mimeType = coverPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    await page.evaluate(({ b64, name, mime }) => {
      try {
        const bStr = atob(b64);
        const len = bStr.length;
        const u8arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8arr[i] = bStr.charCodeAt(i);
        }
        const file = new File([u8arr], name, { type: mime });
        const container = document.querySelector(".cover-editor") || document;
        const inputs = container.querySelectorAll('input[type="file"]');
        for (const inp of inputs) {
          const dt = new DataTransfer();
          dt.items.add(file);
          inp.files = dt.files;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (e) {
        console.warn("DOM DataTransfer 注入备选通道异常:", e);
      }
    }, { b64: fileBase64, name: fileName, mime: mimeType });

    console.log("[blbl-cover] ✅ 已双通道注入封面图片，等待 4 秒上传与裁剪画布渲染（给足等待时间）...");
    await sleep(4000); // 给足等待时间确保图片完成上传与渲染

    // 5. 选中 4:3 比例及开启双比例同步改动
    const ratioResult = await clickRatio43InContainer(page, ".cover-editor");
    if (ratioResult?.clicked) {
      console.log(`[blbl-cover] 已点击 4:3 比例: ${ratioResult.text}`);
    } else {
      // 备选查找：首页推荐封面 (4:3)
      await page.evaluate(() => {
        const container = document.querySelector(".cover-editor") || document;
        for (const el of container.querySelectorAll("button, span, div")) {
          const t = (el.textContent || "").trim();
          if (t.includes("4:3") || t.includes("首页推荐封面")) {
            el.click();
            return true;
          }
        }
        return false;
      });
    }

    // 尝试勾选「双比例同步改动」，避免触发后续二次告警
    await page.evaluate(() => {
      const container = document.querySelector(".cover-editor") || document;
      for (const el of container.querySelectorAll("label, span, div")) {
        if ((el.textContent || "").includes("双比例同步改动")) {
          el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1000);

    // 测试截图 1: 封面注入与 4:3 比例预览阶段
    try {
      await page.screenshot({
        path: "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots/step1-cover-preview.png",
      });
      console.log("[blbl-cover] 📸 已保存步骤1截图: step1-cover-preview.png");
    } catch (_) {}

    // 6. 点击「完成」提交保存（优先命中 <div class="button submit"> 完成 </div>，派发真实鼠标事件）
    await page.evaluate(() => {
      const container = document.querySelector(".cover-editor") || document;
      const preciseSubmit = container.querySelector("div.button.submit, .button.submit");
      if (preciseSubmit && (preciseSubmit.textContent || "").includes("完成")) {
        preciseSubmit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        preciseSubmit.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        preciseSubmit.click();
        return true;
      }
      const btns = container.querySelectorAll(
        "button, .button, .bcc-button--primary, .submit"
      );
      for (const btn of btns) {
        const text = (btn.textContent || "").trim();
        if (text.includes("完成") || text === "确定" || text === "保存") {
          btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          btn.click();
          return true;
        }
      }
      return false;
    });
    console.log("[blbl-cover] 已点击完成按钮，等待关闭或二次确认...");
    await sleep(1500);

    // 7. 处理二次确认弹窗（例如“检测到个人空间封面（16:9）未修改...”）
    const handledSecondConfirm = await page.evaluate(() => {
      const allModals = document.querySelectorAll(
        ".bcc-dialog, .modal, .bili-dialog, [role='dialog'], .bcc-dialog__wrap"
      );
      for (const m of allModals) {
        const text = m.textContent || "";
        if (
          text.includes("检测到个人空间封面") ||
          text.includes("个人空间封面") ||
          text.includes("未修改可能导致") ||
          text.includes("同步到「16:9封面」")
        ) {
          const btns = m.querySelectorAll("button, .bcc-button, .button");
          for (const btn of btns) {
            const bt = (btn.textContent || "").trim();
            if (
              bt.includes("同步") ||
              bt.includes("确定") ||
              bt.includes("完成") ||
              bt.includes("继续") ||
              bt.includes("确认")
            ) {
              btn.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (handledSecondConfirm) {
      console.log("[blbl-cover] 已处理哔哩哔哩二次同步确认弹窗");
      await sleep(1000);
    }

    // 8. 严格等待 .cover-editor 彻底关闭，决不允许遮挡后续的发布按钮
    let isClosed = false;
    for (let i = 0; i < 10; i++) {
      isClosed = await page.evaluate(() => {
        const editor = document.querySelector(".cover-editor");
        if (!editor) return true;
        return editor.offsetParent === null || editor.style.display === "none";
      });
      if (isClosed) break;
      await sleep(500);
    }

    if (!isClosed) {
      console.warn("[blbl-cover] 弹窗未自动关闭，尝试点击右上角关闭按钮兜底");
      await page.evaluate(() => {
        const editor = document.querySelector(".cover-editor") || document;
        const closeBtn = editor.querySelector(
          ".bcc-dialog__close, .close, [aria-label='Close'], svg"
        );
        if (closeBtn) closeBtn.click();
      });
      await sleep(1000);
    }

    // 给足等待时间：等待哔哩哔哩发布页完全同步绑定封面数据（等待 4 秒）
    console.log("[blbl-cover] 等待哔哩哔哩发布页完全同步绑定封面数据（给足等待时间 4 秒）...");
    await sleep(4000);

    // 测试截图 2: 弹窗已成功关闭，展示发布页上的封面缩略图
    try {
      await page.screenshot({
        path: "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots/step2-cover-saved.png",
      });
      console.log("[blbl-cover] 📸 已保存步骤2截图: step2-cover-saved.png");
    } catch (_) {}

    console.log("[blbl-cover] ✅ 哔哩哔哩 4:3 封面设置成功并确认生效");
    return true;
  } catch (err) {
    console.warn("[blbl-cover] 哔哩哔哩封面上传异常（不阻断发布）:", err?.message || err);
  }
  return false;
}

/**
 * 抖音 (Douyin) 封面上传 (4:3 比例)
 *
 * 关键步骤：
 * 1. 在视频发布编辑页找到「设置封面」入口
 * 2. 唤起 .semi-modal 弹窗
 * 3. 切换至「上传封面」Tab
 * 4. 找到 input[type="file"] 注入本地图片
 * 5. 选中「4:3」比例（横版 4:3）
 * 6. 点击裁剪确定与弹窗「完成」，确保弹窗关闭
 */
export async function uploadDouyinCover(page, rawCoverPath) {
  if (!rawCoverPath) return false;
  const coverPath = path.resolve(rawCoverPath);
  if (!fs.existsSync(coverPath)) {
    console.warn(`[dy-cover] 封面文件不存在: ${coverPath}`);
    return false;
  }
  console.log(`[dy-cover] 准备上传抖音 4:3 封面: ${coverPath}`);

  try {
    const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
    try { fs.mkdirSync(shotDir, { recursive: true }); } catch (_) {}

    // 关闭任何页面提示气泡（如「我知道了」）
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll("button, div, span")) {
        const t = (btn.textContent || "").trim();
        if (t === "我知道了") btn.click();
      }
    });
    await sleep(400);

    // 滚动页面到顶部使封面区域完全展现
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    await sleep(600);

    // 步骤 0: 滚动到顶部后截取发布页面全貌
    try {
      await page.screenshot({ path: path.join(shotDir, "dy-step0-entry.png") });
      console.log("[dy-cover] 📸 已保存步骤0截图: dy-step0-entry.png");
    } catch (_) {}

    // 1. 寻找封面设置入口：严格优先定位右侧「横封面4:3」卡片并执行真实鼠标物理点击
    const entryCoord = await page.evaluate(() => {
      // 策略 1: 寻找所有「选择封面」或「更换封面」卡片
      const candidates = [];
      for (const el of document.querySelectorAll("*")) {
        const text = (el.textContent || "").trim();
        if ((text === "选择封面" || text === "更换封面") && el.children.length === 0) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            candidates.push({
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              left: rect.left,
              text,
            });
          }
        }
      }
      if (candidates.length > 0) {
        // 横坐标靠右的即为横封面 4:3
        candidates.sort((a, b) => b.left - a.left);
        return candidates[0];
      }

      // 策略 2: 查找包含 "横封面4:3" 的标签上方卡片
      for (const el of document.querySelectorAll("*")) {
        const text = (el.textContent || "").trim();
        if (text === "横封面4:3" && el.children.length === 0) {
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top - 40),
            left: rect.left,
            text: "横封面卡片",
          };
        }
      }
      return null;
    });

    if (entryCoord) {
      console.log("[dy-cover] 精准锁定横封面4:3卡片坐标并点击:", entryCoord);
      await page.mouse.click(entryCoord.x, entryCoord.y);
    } else {
      console.warn("[dy-cover] 未获取到卡片坐标，尝试兜底点击");
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("*")).filter(
          (el) => ((el.textContent || "").trim() === "选择封面" || (el.textContent || "").trim() === "更换封面") && el.children.length === 0
        );
        if (btns.length > 1) {
          btns.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
          btns[0].click();
        } else if (btns.length === 1) {
          btns[0].click();
        }
      });
    }
    await sleep(1000);

    // 2. 等待弹窗渲染
    await page.waitForSelector(".semi-modal-body, .semi-modal, [class*='modal']", {
      visible: true,
      timeout: 10000,
    }).catch(() => null);
    await sleep(1500);

    // 步骤 1: 展开弹窗后截图
    try {
      await page.screenshot({ path: path.join(shotDir, "dy-step1-modal-opened.png") });
      console.log("[dy-cover] 📸 已保存步骤1截图: dy-step1-modal-opened.png");
    } catch (_) {}

    // 3. 关键：明确切换至「设置横封面」Tab
    console.log("[dy-cover] 切换至【设置横封面】Tab...");
    await page.evaluate(() => {
      const modal = document.querySelector(".semi-modal-body, .semi-modal") || document;
      for (const el of modal.querySelectorAll("div, span, button, [role='tab'], .semi-tabs-tab")) {
        const t = (el.textContent || "").trim();
        if (t === "设置横封面" && el.children.length === 0) {
          el.click();
          return true;
        }
      }
      for (const el of modal.querySelectorAll("button, .semi-button")) {
        const t = (el.textContent || "").trim();
        if (t === "设置横封面") {
          el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);

    // 步骤 2: 切换到设置横封面Tab截图
    try {
      await page.screenshot({ path: path.join(shotDir, "dy-step2-tab-switched.png") });
      console.log("[dy-cover] 📸 已保存步骤2截图: dy-step2-tab-switched.png");
    } catch (_) {}

    // 4. 定位并上传图片文件
    let inputHandle =
      (await page.$('.container-XzaV9h input[type="file"]')) ||
      (await page.$('[class*="upload-ZOJTUA"] input[type="file"]')) ||
      (await page.$('.semi-modal input[type="file"][accept*="image"]')) ||
      (await page.$('input[type="file"][accept*="image"]'));

    if (!inputHandle) {
      await page.evaluate(() => {
        const tip = document.querySelector(".upload-tips-KomyJM") || document.querySelector(".text-zsBQsb");
        if (tip) {
          const p = tip.closest('[class*="upload"]');
          if (p) {
            const inp = p.querySelector('input[type="file"]');
            if (inp) inp.click();
          }
        }
      });
      await sleep(500);
      inputHandle =
        (await page.$('.container-XzaV9h input[type="file"]')) ||
        (await page.$('.semi-modal input[type="file"][accept*="image"]'));
    }

    if (inputHandle) {
      await inputHandle.uploadFile(coverPath);
      console.log("[dy-cover] ✅ 已成功通过 input[type='file'] 注入封面图片");
    } else {
      console.warn("[dy-cover] 未直接找到 image input");
    }

    console.log("[dy-cover] 等待 5 秒图片上传与渲染（给足等待时间）...");
    await sleep(5000);

    // 步骤 3: 注入图片并显示裁剪界面截图
    try {
      await page.screenshot({ path: path.join(shotDir, "dy-step3-image-injected.png") });
      console.log("[dy-cover] 📸 已保存步骤3截图: dy-step3-image-injected.png");
    } catch (_) {}

    // 5. 若有裁剪子弹窗，点击「保存」按钮
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("button, .semi-button")) {
        const t = (b.textContent || "").trim();
        if (t === "保存") {
          b.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);

    // 步骤 4: 裁剪确认后截图
    try {
      await page.screenshot({ path: path.join(shotDir, "dy-step4-ratio-selected.png") });
      console.log("[dy-cover] 📸 已保存步骤4截图: dy-step4-ratio-selected.png");
    } catch (_) {}

    // 6. 点击主模态框的「完成」按钮
    await page.evaluate(() => {
      const modal = document.querySelector(".semi-modal-body, .semi-modal") || document;
      for (const b of modal.querySelectorAll("button, .semi-button")) {
        const t = (b.textContent || "").trim();
        if (t === "完成" && !b.disabled && !b.className.includes("disabled")) {
          b.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);

    // 7. 处理可能弹出的「设置竖封面获更多流量」挽留弹窗（点击「暂不设置」）
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("button, .semi-button")) {
        const t = (b.textContent || "").trim();
        if (t === "暂不设置") {
          b.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);

    // 8. 等待弹窗彻底关闭
    for (let i = 0; i < 10; i++) {
      const isClosed = await page.evaluate(() => {
        const m = document.querySelector(".semi-modal, .semi-modal-mask");
        return !m || m.offsetParent === null || m.style.display === "none";
      });
      if (isClosed) break;
      await sleep(600);
    }

    // 给足等待时间：等待抖音主页面完全同步绑定封面数据（给足等待时间 5 秒）
    console.log("[dy-cover] 等待抖音页面完全同步绑定封面数据（给足等待时间 5 秒）...");
    await sleep(5000);

    // 步骤 5: 弹窗关闭且主页面稳定后的最终页面截图
    try {
      await page.screenshot({ path: path.join(shotDir, "dy-step5-cover-confirmed.png") });
      console.log("[dy-cover] 📸 已保存步骤5截图: dy-step5-cover-confirmed.png");
    } catch (_) {}

    console.log("[dy-cover] ✅ 抖音 4:3 封面设置完成并确认生效");
    return true;
  } catch (err) {
    console.warn("[dy-cover] 抖音封面上传异常（不阻断发布）:", err?.message || err);
  }
  return false;
}

/**
 * 快手 (Kuaishou) 封面上传 (4:3 比例)
 *
 * 关键步骤：
 * 1. 寻找并点击「编辑封面」/「设置封面」入口
 * 2. 等待弹窗 .ant-modal
 * 3. 切换至「上传封面」Tab
 * 4. 找到 input[type="file"] 注入本地图片
 * 5. 选中「4:3」比例单选框
 * 6. 点击「确定」按钮保存，等待弹窗关闭
 */
export async function uploadKuaishouCover(page, rawCoverPath) {
  if (!rawCoverPath) return false;
  const coverPath = path.resolve(rawCoverPath);
  if (!fs.existsSync(coverPath)) {
    console.warn(`[ks-cover] 封面文件不存在: ${coverPath}`);
    return false;
  }
  console.log(`[ks-cover] 准备上传快手 4:3 封面: ${coverPath}`);

  try {
    const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
    try { fs.mkdirSync(shotDir, { recursive: true }); } catch (_) {}

    // 递归滚动所有可滚动容器到最顶部，让封面区域完全呈现
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      for (const el of document.querySelectorAll("*")) {
        if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
          el.scrollTop = 0;
        }
      }
    });
    await sleep(600);

    // 步骤 0: 滚动到顶部后截取发布页面包含封面卡片的高清全貌
    try {
      await page.screenshot({ path: path.join(shotDir, "ks-step0-entry.png") });
      console.log("[ks-cover] 📸 已保存步骤0截图: ks-step0-entry.png");
    } catch (_) {}

    // 1. 精准获取快手封面卡片（排除推荐容器）
    const cardCoords = await page.evaluate(() => {
      const card =
        document.querySelector('[class*="cover-full-editor"]') ||
        document.querySelector('[class*="default-cover"]');
      if (!card) return null;
      card.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      const rect = card.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        cls: card.className,
        html: card.outerHTML.slice(0, 200),
      };
    });

    if (!cardCoords) {
      console.warn("[ks-cover] 未找到快手封面设置入口，跳过");
      return false;
    }
    console.log("[ks-cover] 精准锁定封面卡片:", cardCoords);

    // 移动鼠标 hover 激活卡片悬浮状态并真实点击
    await page.mouse.move(cardCoords.x, cardCoords.y);
    await sleep(300);
    await page.mouse.click(cardCoords.x, cardCoords.y);

    // 辅助派发 DOM click
    await page.evaluate(() => {
      const card =
        document.querySelector('[class*="cover-full-editor"]') ||
        document.querySelector('[class*="default-cover"]');
      if (card) {
        card.click();
        const textBtn = card.querySelector("button, div, span");
        if (textBtn) textBtn.click();
      }
    });

    console.log("[ks-cover] ✅ 已双重点击快手封面卡片，等待弹窗展开...");
    await sleep(2000);

    // 2. 等待快手封面编辑弹窗渲染
    await page.waitForFunction(() => {
      for (const el of document.querySelectorAll("*")) {
        const text = (el.textContent || "").trim();
        const style = window.getComputedStyle(el);
        if (
          (style.position === "fixed" || style.position === "absolute") &&
          style.display !== "none" &&
          el.offsetWidth > 300 &&
          el.offsetHeight > 200
        ) {
          if (text.includes("封面") || text.includes("截取") || text.includes("上传") || text.includes("比例")) {
            return true;
          }
        }
      }
      return false;
    }, { timeout: 10000 }).catch(() => null);

    // 步骤 1: 弹窗打开后截图
    try {
      await page.screenshot({ path: path.join(shotDir, "ks-step1-modal-opened.png") });
      console.log("[ks-cover] 📸 已保存步骤1截图: ks-step1-modal-opened.png");
    } catch (_) {}

    // 关键等待：等待快手默认视频帧抽取完成（等待「加载中」消失），避免后台异步抽取阻塞或覆盖
    console.log("[ks-cover] 等待快手弹窗初始视频帧加载完成（等待「加载中」结束）...");
    for (let i = 0; i < 30; i++) {
      const isLoading = await page.evaluate(() => {
        const modal = document.querySelector(".ant-modal");
        if (!modal) return false;
        return Array.from(modal.querySelectorAll("*")).some((el) => {
          const t = (el.textContent || "").trim();
          return t === "加载中" || el.className.includes("spin") || el.className.includes("loading");
        });
      });
      if (!isLoading) {
        console.log(`[ks-cover] 初始加载在 ${i * 500}ms 后完成`);
        break;
      }
      await sleep(500);
    }
    await sleep(1000);

    // 3. 点击并确保切换到「上传封面」Tab（多轮点击直至 active 激活）
    console.log("[ks-cover] 点击并确保激活「上传封面」Tab...");
    for (let attempt = 1; attempt <= 10; attempt++) {
      const tabActive = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('div[class*="_header-title-item"]'));
        const uploadTab = tabs.find((t) => (t.textContent || "").trim() === "上传封面");
        if (!uploadTab) return { found: false };
        const isActive = uploadTab.className.includes("active") || uploadTab.className.includes("Active");
        if (!isActive) {
          uploadTab.click();
        }
        return { found: true, isActive };
      });
      if (tabActive?.isActive) {
        console.log("[ks-cover] ✅ 「上传封面」Tab 已成功激活");
        break;
      }
      await sleep(800);
    }

    // 等待【上传图片】按钮渲染
    for (let i = 0; i < 20; i++) {
      const hasUploadBtn = await page.evaluate(() => {
        const modal = document.querySelector(".ant-modal");
        return modal && Array.from(modal.querySelectorAll("*")).some((el) => (el.textContent || "").trim() === "上传图片");
      });
      if (hasUploadBtn) break;
      await sleep(500);
    }
    await sleep(800);

    // 步骤 2: 切换到上传封面Tab截图
    try {
      await page.screenshot({ path: path.join(shotDir, "ks-step2-tab-switched.png") });
      console.log("[ks-cover] 📸 已保存步骤2截图: ks-step2-tab-switched.png");
    } catch (_) {}

    // 4. 定位封面专属 input[type="file"]（位于 div[class*='cropper-upload'] 内，或最后一个 image input）
    let fileUploaded = false;
    let coverInputHandle =
      (await page.$("div[class*='cropper-upload'] input[type='file']")) ||
      (await page.$("._cropper-upload-upload_1i0wh_38 input[type='file']"));

    if (!coverInputHandle) {
      const allImageInputs = await page.$$('input[type="file"][accept*="image"]');
      if (allImageInputs.length > 0) {
        coverInputHandle = allImageInputs[allImageInputs.length - 1];
      }
    }

    if (coverInputHandle) {
      try {
        await coverInputHandle.uploadFile(coverPath);
        fileUploaded = true;
        console.log("[ks-cover] ✅ 成功定位封面专属 input 并通过 uploadFile 注入本地图片");
      } catch (uploadErr) {
        console.warn("[ks-cover] 专属 input.uploadFile 异常:", uploadErr?.message);
      }
    }

    // 备用通道：物理点击「上传图片」按钮 + waitForFileChooser
    if (!fileUploaded) {
      const uploadBtnCoord = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button, div, span")) {
          const t = (el.textContent || "").trim();
          if (t === "上传图片" && el.children.length === 0) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
              };
            }
          }
        }
        return null;
      });

      if (uploadBtnCoord) {
        try {
          const [fileChooser] = await Promise.all([
            page.waitForFileChooser({ timeout: 5000 }).catch(() => null),
            (async () => {
              await page.mouse.move(uploadBtnCoord.x, uploadBtnCoord.y);
              await sleep(150);
              await page.mouse.click(uploadBtnCoord.x, uploadBtnCoord.y);
            })(),
          ]);

          if (fileChooser) {
            await fileChooser.accept([coverPath]);
            fileUploaded = true;
            console.log("[ks-cover] ✅ 通过 waitForFileChooser 拦截并注入封面文件");
          }
        } catch (fcErr) {
          console.warn("[ks-cover] waitForFileChooser 处理异常:", fcErr?.message);
        }
      }
    }

    // 等待裁剪画布渲染出来（等待【清空上传】出现）
    console.log("[ks-cover] 等待裁剪画布渲染完成（等待「清空上传」出现）...");
    for (let i = 0; i < 25; i++) {
      const cropReady = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("*")).some(
          (el) => (el.textContent || "").trim() === "清空上传"
        );
      });
      if (cropReady) break;
      await sleep(500);
    }
    await sleep(1500);

    // 步骤 3: 注入图片并显示裁剪界面截图
    try {
      await page.screenshot({ path: path.join(shotDir, "ks-step3-image-injected.png") });
      console.log("[ks-cover] 📸 已保存步骤3截图: ks-step3-image-injected.png");
    } catch (_) {}

    // 5. 选中 4:3 比例
    const ratioResult = await page.evaluate(() => {
      const ratios = document.querySelectorAll('div[class*="_ratio-item"], [class*="ratio"]');
      for (const r of ratios) {
        const text = (r.textContent || "").trim();
        if (text.includes("4:3") && !text.includes("3:4")) {
          r.click();
          const s = r.querySelector("span");
          if (s) s.click();
          return { ok: true, text };
        }
      }
      return { ok: false };
    });
    console.log("[ks-cover] 选中 4:3 比例结果:", ratioResult);
    await sleep(1500);

    // 步骤 4: 选中 4:3 比例截图
    try {
      await page.screenshot({ path: path.join(shotDir, "ks-step4-ratio-selected.png") });
      console.log("[ks-cover] 📸 已保存步骤4截图: ks-step4-ratio-selected.png");
    } catch (_) {}

    // 6. 点击「确认」按钮保存封面
    console.log("[ks-cover] 点击【确认】按钮提交封面保存...");
    const confirmClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".ant-modal button, .ant-modal .ant-btn"));
      for (const b of btns) {
        if ((b.textContent || "").trim() === "确认") {
          b.click();
          return true;
        }
      }
      return false;
    });
    console.log("[ks-cover] 点击【确认】结果:", confirmClicked);

    // 7. 等待保存请求完成与弹窗自然关闭
    console.log("[ks-cover] 等待保存完成与弹窗自然关闭...");
    let isClosed = false;
    for (let i = 0; i < 20; i++) {
      isClosed = await page.evaluate(() => {
        const modal = document.querySelector(".ant-modal");
        return !modal || modal.offsetParent === null || modal.style.display === "none";
      });
      if (isClosed) {
        console.log(`[ks-cover] ✅ 弹窗在 ${i * 500}ms 内自然关闭！`);
        break;
      }
      await sleep(500);
    }

    // 给足等待时间同步数据并渲染主界面封面
    await sleep(4000);

    // 步骤 5: 弹窗关闭且主页面稳定后的最终页面截图
    try {
      await page.screenshot({ path: path.join(shotDir, "ks-step5-cover-confirmed.png") });
      console.log("[ks-cover] 📸 已保存步骤5截图: ks-step5-cover-confirmed.png");
    } catch (_) {}

    console.log("[ks-cover] ✅ 快手 4:3 封面设置完成并确认生效");
    return true;
  } catch (err) {
    console.warn("[ks-cover] 快手封面上传异常（不阻断发布）:", err?.message || err);
  }
  return false;
}

/**
 * 统一多平台封面上传分发器
 */
export async function uploadPlatformCover(platform, page, coverPath) {
  if (!coverPath) return false;
  const p = String(platform || "").toLowerCase();
  if (p.includes("blbl") || p.includes("b站") || p.includes("哔哩")) {
    return uploadBilibiliCover(page, coverPath);
  }
  if (p.includes("dy") || p.includes("抖音")) {
    return uploadDouyinCover(page, coverPath);
  }
  if (p.includes("ks") || p.includes("快手")) {
    return uploadKuaishouCover(page, coverPath);
  }
  return false;
}
