import path from "path";
import {
  readPageUrl,
  replyPublishFailure,
  replyPublishOutcome,
} from "./publishOutcome.js";
import {
  getCreativeStatementOption,
  resolveBlblCreativeStatementLabel,
} from "../../../shared/creativeStatement.js";
import {
  pollPageUntil,
  WAIT_SELECTOR_APPEAR_MS,
  WAIT_UPLOAD_PROCESSING_MS,
} from "./uploadTimeouts.js";
import {
  buildPlatformVideoText,
  normalizeVideoTags,
} from "../../../shared/videoMetadata.js";
import { uploadBilibiliCover } from "./platformCover.js";

async function waitForBlblAutoCover(page) {
  await pollPageUntil(
    page,
    () => {
      const main = document.querySelector(".cover-main");
      if (!main) return false;
      const empty = main.querySelector(".cover-empty");
      const img = main.querySelector(".cover-img");
      return !empty && !!img;
    },
    WAIT_UPLOAD_PROCESSING_MS,
    2000,
    "哔哩哔哩封面自动生成超时"
  );
}

export function findBlblCoverEntry(root = document) {
  return root.querySelector(".cover-empty");
}

/**
 * 视频上传成功后默认设置封面：
 * 点击「封面设置」→ 弹窗中滑块往左滑 10px → 点击「完成」。
 * 任何步骤失败均跳过，不阻断发布。
 */
async function handleBlblCover(page) {
  try {
    // 1. 等待并点击新版封面设置入口
    const deadline = Date.now() + WAIT_SELECTOR_APPEAR_MS;
    let coverEntry = null;
    while (!coverEntry && Date.now() < deadline) {
      const handle = await page
        .evaluateHandle(findBlblCoverEntry)
        .catch(() => null);
      coverEntry = handle?.asElement() || null;
      if (!coverEntry) {
        await handle?.dispose();
        await page.waitForTimeout(2000);
      }
    }
    if (!coverEntry) throw new Error("未找到哔哩哔哩封面设置入口");
    await coverEntry.click({ delay: 200 });
    await coverEntry.dispose();
    console.log("[blbl] 已点击封面设置入口");

    // 2. 等待封面编辑弹窗
    await page.waitForSelector(".cover-editor.bcc-dialog__wrap", {
      visible: true,
      timeout: WAIT_SELECTOR_APPEAR_MS,
    });
    await page.waitForTimeout(1000); // 等待弹窗内组件渲染

    // 3. 滑块往左滑 10px
    const handle = await page.waitForSelector(".vue-slider-dot-handle", {
      visible: true,
      timeout: WAIT_SELECTOR_APPEAR_MS,
    });
    const box = await handle.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 10, cy, { steps: 5 });
      await page.mouse.up();
      console.log("[blbl] 滑块已往左滑 10px");
    }

    await page.waitForTimeout(500);

    // 4. 点击「完成」按钮
    const submitClicked = await page.evaluate(() => {
      const container = document.querySelector(".cover-editor") || document;
      const btns = container.querySelectorAll(".button.submit");
      for (const btn of btns) {
        if ((btn.textContent || "").trim().includes("完成")) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (submitClicked) {
      console.log("[blbl] 封面设置完成");
    } else {
      console.warn("[blbl] 未找到封面完成按钮，跳过");
    }

    await page.waitForTimeout(1000); // 等待弹窗关闭
  } catch (e) {
    console.warn("[blbl] 封面设置失败，跳过:", e?.message || e);
  }
}

async function selectBlblCreativeStatement(page, data) {
  const value = data.data && data.data.creativeStatement;
  console.log("[blbl] creativeStatement 值 =", value);
  // 注意：「无标注」对应 B 站「内容无需标注」，也必须主动点选，不能跳过
  const opt = getCreativeStatementOption(value);
  const label = resolveBlblCreativeStatementLabel(value);
  console.log(
    "[blbl] 准备选择创作声明:",
    label,
    "optionalAuth=",
    !!opt.optionalAuth
  );

  const trigger = await page.$(
    ".statement-content .bcc-select-input-wrap input"
  );
  if (!trigger) {
    console.warn("未找到哔哩哔哩创作声明选择器，跳过");
    return;
  }
  await trigger.click({ delay: 200 });
  await page.waitForSelector(".statement-content .bcc-select-list-wrap", {
    visible: true,
    timeout: WAIT_SELECTOR_APPEAR_MS,
  });

  const picked = await page.evaluate(
    (text, isAuthOption) => {
      if (isAuthOption) {
        const auth = document.querySelector(
          ".statement-content .auth-content .option-text"
        );
        if (auth && auth.textContent.trim() === text) {
          auth.closest(".auth-content")?.click();
          return true;
        }
        return false;
      }
      const spans = document.querySelectorAll(
        ".statement-content li.bcc-option span"
      );
      for (const span of spans) {
        if (span.textContent.trim() === text) {
          span.closest("li.bcc-option")?.click();
          return true;
        }
      }
      return false;
    },
    label,
    !!opt.optionalAuth
  );

  if (!picked) {
    console.warn(`未找到哔哩哔哩创作声明选项: ${label}`);
  }
  await page.waitForTimeout(300);
}

export default async function (page, data, window, event) {
  const isDraftMode =
    data.publishMode === "draft" || data.publishToDraft === true;
  const text = buildPlatformVideoText("哔哩哔哩", data.data);

  console.log(data);
  try {
    let sel = '.bcc-upload input[type="file"]';
    await page.waitForSelector(sel, { timeout: WAIT_SELECTOR_APPEAR_MS });
    const uploadInputs = await page.$(sel);
    await uploadInputs.uploadFile(path.resolve(data.filePath));
  } catch (err) {
    console.error("文件上传失败:", err);
  }

  try {
    const selector = '.input-instance input[placeholder="请输入稿件标题"]';
    await page.waitForSelector(selector, { timeout: WAIT_SELECTOR_APPEAR_MS });
    const input = await page.$(selector);
    await input.click({ clickCount: 3 }); // 三击全选
    await page.keyboard.press("Backspace"); // 删除内容
    await page.keyboard.type(text.title, { delay: 50 });
  } catch (e) {
    console.error("❌ 输入标题失败", e);
  }

  // 标题输入完后立即选择创作声明（必须声明）
  try {
    await selectBlblCreativeStatement(page, data);
  } catch (e) {
    console.warn("哔哩哔哩创作声明选择未完成:", e?.message || e);
  }

  try {
    const targetCategory =
      (data.data && (data.data.blblCategory || data.data.blblTid)) ||
      data.blblCategory ||
      "音乐";
    console.log(`[blbl] 准备选择哔哩哔哩分区: ${targetCategory}`);
    const selector = ".video-human-type .select-container";
    await page.waitForSelector(selector, { timeout: WAIT_SELECTOR_APPEAR_MS });
    const input = await page.$(selector);
    await input.click();
    await page.waitForSelector(".human-type-list", {
      timeout: WAIT_SELECTOR_APPEAR_MS,
    });
    const clicked = await page.evaluate((cat) => {
      const items = document.querySelectorAll(
        ".human-type-list div[title], .human-type-list li, .human-type-list .type-item, .human-type-list div"
      );
      for (const item of items) {
        const title = (item.getAttribute("title") || item.textContent || "").trim();
        if (title === cat) {
          item.click();
          return true;
        }
      }
      for (const item of items) {
        const title = (item.getAttribute("title") || item.textContent || "").trim();
        if (title.includes(cat)) {
          item.click();
          return true;
        }
      }
      return false;
    }, targetCategory);
    if (!clicked) {
      console.warn(`[blbl] 未能通过 evaluate 点击分区 ${targetCategory}，尝试直接选择`);
      const fallback = await page.$(`.human-type-list div[title="${targetCategory}"]`);
      if (fallback) await fallback.click();
    } else {
      console.log(`[blbl] ✅ 已选择分区: ${targetCategory}`);
    }
    // 测试截图 3: 已选择分区
    try {
      await page.screenshot({
        path: "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots/step3-category-selected.png",
      });
      console.log("[blbl] 📸 已保存步骤3截图: step3-category-selected.png");
    } catch (_) {}
  } catch (e) {
    console.error("❌ 输入类型失败", e);
  }
  try {
    const selector = ".desc-container .ql-editor";
    await page.waitForSelector(selector, { timeout: WAIT_SELECTOR_APPEAR_MS });
    const input = await page.$(selector);
    await input.click();
    if (text.description) {
      await page.keyboard.type(text.description);
    }
  } catch (e) {
    console.error("❌ 输入简介失败", e);
  }
  try {
    const tag = normalizeVideoTags(data.data.tags);
    const selector = ".tag-container .input-instance input";
    await page.waitForSelector(selector, { timeout: WAIT_SELECTOR_APPEAR_MS });
    const input = await page.$(selector);

    // 1. 先彻底清除哔哩哔哩页面上原本已有的默认标签（如系统推荐/遗留标签）
    console.log("[blbl] 正在清除哔哩哔哩页面上原有的默认标签...");
    await page.evaluate(() => {
      const container = document.querySelector(".tag-container") || document;
      const inputWrap =
        document.querySelector(".tag-container .input-instance")?.parentElement ||
        container;

      const candidates = inputWrap.querySelectorAll(
        '.label-item-v2 [class*="close"], [class*="tag"] [class*="close"], [class*="tag-item"] [class*="close"], [class*="selected"] [class*="close"], .label-item-v2 span, [class*="tag"] span, svg, i'
      );
      for (const btn of candidates) {
        try {
          const text = (btn.textContent || "").trim();
          const cls = String(btn.className || "");
          if (text === "×" || text === "✕" || cls.includes("close") || cls.includes("del")) {
            if (typeof btn.click === "function") {
              btn.click();
            } else if (btn.parentElement && typeof btn.parentElement.click === "function") {
              btn.parentElement.click();
            } else {
              btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }
          }
        } catch (_) {}
      }
    }).catch(() => {});

    // 2. 聚焦输入框并使用 Backspace 连续按键清空原有标签（稳健清除所有推荐标签）
    await input.focus();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);

    // 3. 填入用户在客户端指定的标签
    console.log("[blbl] 原有标签已清除，正在填入用户指定的标签:", tag);
    for (let i = 0; i < tag.length; i++) {
      await page.keyboard.type(tag[i], { delay: 100 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      await input.focus();
    }
    console.log("[blbl] ✅ 哔哩哔哩标签填写完成");

    // 保存标签填写后的截图
    try {
      await page.screenshot({
        path: "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots/step3-tags-applied.png",
      });
      console.log("[blbl] 📸 已保存标签测试截图: step3-tags-applied.png");
    } catch (_) {}
  } catch (e) {
    console.error("❌ 输入标签失败", e);
  }

  try {
    // 用 pollPageUntil 替代 waitForSelector，避免 puppeteer 默认 protocolTimeout
    // (约 180s) 把单次 Runtime.callFunctionOn 砍掉，导致弱网/大文件场景下假性超时。
    await pollPageUntil(
      page,
      () => !!document.querySelector(".file-item-content-status .success"),
      WAIT_UPLOAD_PROCESSING_MS,
      2000,
      "等待哔哩哔哩视频上传完成超时"
    );
  } catch (e) {
    console.warn("哔哩哔哩视频上传未完成，跳过后续步骤:", e?.message || e);
  }

  const coverPath = data.coverPath || (data.data && data.data.coverPath);
  let customCoverSuccess = false;
  if (coverPath) {
    customCoverSuccess = await uploadBilibiliCover(page, coverPath);
  }
  if (!customCoverSuccess) {
    await handleBlblCover(page);
  }

  try {
    await page.waitForTimeout(500);
    // 点击一下空白的区域
    await page.click("body", { delay: 200 });
    await page.waitForSelector(".submit-container .submit-add", {
      timeout: WAIT_SELECTOR_APPEAR_MS,
    });
    // 存到草稿
    await page.waitForSelector(".submit-draft", {
      timeout: WAIT_SELECTOR_APPEAR_MS,
    });
    const urlBefore = readPageUrl(page);
    if (isDraftMode) {
      await page.click(".submit-draft", { delay: 200 });
    } else {
      // 发布
      await page.click(".submit-add", { clickCount: 2, delay: 200 });
    }
    // 检测._phone-label_1eni7_34 消失
    console.log(
      isDraftMode ? "✅ 哔哩哔哩视频已保存草稿" : "✅ 哔哩哔哩视频上传成功"
    );
    await replyPublishOutcome({
      page,
      data,
      window,
      event,
      urlBefore,
      isDraftMode,
      successMessage: isDraftMode ? "保存草稿成功" : "上传成功",
    });
  } catch (e) {
    // 失败瞬间截图留证（登录过期 / 风控弹窗 / 元素改版都能一眼看出）
    await replyPublishFailure({
      page,
      data,
      window,
      event,
      message: "上传失败",
      closeWindow: true,
    });
    console.error("❌ 发布失败", e);
  }
}
