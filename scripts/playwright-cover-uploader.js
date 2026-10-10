/**
 * Playwright 专用：哔哩哔哩、快手、抖音 4:3 封面上传与裁剪自动化模块
 *
 * 特性：
 * 1. 严格支持 4:3 比例选择
 * 2. 哔哩哔哩自动处理「个人空间封面未修改」二次同步弹窗，确保遮罩完全关闭
 * 3. 抖音与快手完成裁剪比例选择与二级确认，等待模态框彻底关闭
 */

const path = require("path");
const fs = require("fs");

/**
 * 延迟等待
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 在容器中寻找匹配 4:3 比例的元素并点击
 * @param {import('playwright').Locator} container
 */
async function selectRatio43Playwright(container) {
  try {
    // 匹配 4:3、4 : 3、横版 4:3 等文本
    const candidates = container.locator(
      'button, span, div, label, [role="radio"], [role="tab"], .ant-radio-button-wrapper, .semi-radio'
    );
    const count = await candidates.count();
    const ratioRegex = /(?:^|[^\d])4\s*[:：\/]\s*3(?:[^\d]|$)/;

    for (let i = 0; i < count; i++) {
      const el = candidates.nth(i);
      const text = (await el.innerText().catch(() => "")) || "";
      const trimmed = text.trim();
      // 排除 3:4 等干扰，只选 4:3
      if (ratioRegex.test(trimmed) && !trimmed.includes("3:4") && !trimmed.includes("3 : 4")) {
        console.log(`[Playwright-ratio] 找到 4:3 比例选项: "${trimmed}"，正在点击`);
        await el.click();
        await sleep(500);
        return true;
      }
    }
  } catch (e) {
    console.warn("[Playwright-ratio] 选择 4:3 比例失败:", e?.message || e);
  }
  return false;
}

/**
 * 使用 Playwright 对各平台进行 4:3 封面上传
 * @param {import('playwright').Page} page - Playwright Page 实例
 * @param {'哔哩哔哩' | '快手' | '抖音' | string} platform - 目标平台
 * @param {string} coverPath - 本地封面图片绝对路径
 */
async function uploadCoverWithPlaywright(page, platform, coverPath) {
  if (!coverPath) return false;
  const absPath = path.resolve(coverPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`封面文件不存在: ${absPath}`);
  }

  const normPt = String(platform).trim().toLowerCase();

  // ===================== 1. 哔哩哔哩 (4:3 比例) =====================
  if (normPt.includes("哔哩") || normPt.includes("blbl") || normPt.includes("b站")) {
    console.log(`[Playwright-blbl] 正在上传哔哩哔哩 4:3 封面: ${absPath}`);
    // 定位封面设置按钮（优先匹配 .add-text「添加封面」）
    const entry = page.locator(".add-text, text=添加封面, .cover-empty, .cover-main, .cover-img, .cover-wrp, text=设置封面, text=更换封面").first();
    await entry.waitFor({ state: "visible", timeout: 15000 });
    await entry.click();

    // 等待封面编辑弹窗
    const dialog = page.locator(".cover-editor, .bcc-dialog__wrap").first();
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await sleep(600);

    // 切换到「上传封面」Tab（优先匹配 .upload-text「上传封面」）
    const uploadTab = dialog.locator('.upload-text, text=上传封面, text=自选封面, text=本地上传, [role="tab"]:has-text("上传")').first();
    if (await uploadTab.count()) {
      await uploadTab.click();
      await sleep(400);
    }

    // 上传文件至 input
    const fileInput = dialog.locator('input[type="file"]').first();
    await fileInput.setInputFiles(absPath);
    console.log("[Playwright-blbl] 已注入封面图片，等待 2 秒上传完成...");
    await sleep(2000); // 等待 2 秒

    // 选中 4:3 比例
    await selectRatio43Playwright(dialog);

    // 尝试开启「双比例同步改动」
    try {
      const syncCheckbox = dialog.locator('text=双比例同步改动, label:has-text("双比例同步")').first();
      if (await syncCheckbox.count()) {
        await syncCheckbox.click();
        console.log("[Playwright-blbl] 已勾选双比例同步改动");
      }
    } catch (_) {}

    await sleep(500);

    // 点击弹窗底部的「完成」按钮（优先匹配 div.button.submit「完成」）
    const submitBtn = dialog.locator('div.button.submit:has-text("完成"), .button.submit:has-text("完成"), button:has-text("完成"), button:has-text("确定")').first();
    await submitBtn.click();
    console.log("[Playwright-blbl] 已点击封面完成按钮");
    await sleep(800);

    // 核心处理：检测是否存在二次确认弹窗（如“检测到个人空间封面（16:9）未修改”）
    try {
      const confirmDialog = page.locator(
        '.bcc-dialog:has-text("检测到个人空间封面"), .modal:has-text("个人空间封面"), div:has-text("是否将「4:3封面」的改动同步")'
      ).first();
      if (await confirmDialog.count()) {
        console.log("[Playwright-blbl] 检测到二次同步提示弹窗，确认同步...");
        const okBtn = confirmDialog.locator(
          'button:has-text("同步"), button:has-text("确定"), button:has-text("完成"), button:has-text("继续")'
        ).first();
        if (await okBtn.count()) {
          await okBtn.click();
          await sleep(500);
        }
      }
    } catch (_) {}

    // 严格等待弹窗彻底关闭，避免遮挡发布按钮
    try {
      await dialog.waitFor({ state: "hidden", timeout: 5000 });
      console.log("[Playwright-blbl] ✅ 封面弹窗已彻底关闭");
    } catch (_) {
      console.warn("[Playwright-blbl] 封面弹窗超时未自动关闭，尝试点击关闭图标");
      const closeBtn = dialog.locator('.bcc-dialog__close, .close, svg[class*="close"]').first();
      if (await closeBtn.count()) {
        await closeBtn.click();
      }
    }

    return true;
  }

  // ===================== 2. 抖音 (4:3 比例) =====================
  if (normPt.includes("抖音") || normPt.includes("dy")) {
    console.log(`[Playwright-dy] 正在上传抖音 4:3 封面: ${absPath}`);
    // 点击选择/设置封面
    const entry = page.locator(
      'button:has-text("设置封面"), div:has-text("设置封面"), span:has-text("设置封面"), button:has-text("选择封面")'
    ).first();
    await entry.waitFor({ state: "visible", timeout: 15000 });
    await entry.click();

    // 等待弹窗
    const modal = page.locator(".semi-modal, .semi-modal-body").first();
    await modal.waitFor({ state: "visible", timeout: 10000 });
    await sleep(600);

    // 切换至上传封面 Tab
    const tab = modal.locator('text=上传封面, text=本地上传, .semi-tabs-tab:has-text("上传")').first();
    if (await tab.count()) {
      await tab.click();
      await sleep(400);
    }

    // 上传文件
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(absPath);
    console.log("[Playwright-dy] 已注入封面图片，等待渲染");
    await sleep(2000);

    // 选中 4:3 比例
    await selectRatio43Playwright(modal);
    await sleep(500);

    // 二级确认：先点裁剪确定/完成，再点弹窗完成
    const confirmBtns = modal.locator('button.semi-button-primary, button:has-text("完成"), button:has-text("确定")');
    const btnCount = await confirmBtns.count();
    if (btnCount > 0) {
      await confirmBtns.first().click();
      await sleep(800);
    }

    // 若弹窗依然存在且还有完成按钮，再次点击
    if ((await modal.count()) && (await modal.isVisible())) {
      const finalBtn = modal.locator('button.semi-button-primary:has-text("完成"), button:has-text("完成")').last();
      if (await finalBtn.count()) {
        await finalBtn.click();
        await sleep(500);
      }
    }

    // 等待弹窗关闭
    try {
      await modal.waitFor({ state: "hidden", timeout: 5000 });
      console.log("[Playwright-dy] ✅ 抖音封面设置完成并关闭弹窗");
    } catch (_) {}

    return true;
  }

  // ===================== 3. 快手 (4:3 比例) =====================
  if (normPt.includes("快手") || normPt.includes("ks")) {
    console.log(`[Playwright-ks] 正在上传快手 4:3 封面: ${absPath}`);
    // 点击编辑封面
    const entry = page.locator('button:has-text("编辑封面"), span:has-text("编辑封面"), button:has-text("设置封面")').first();
    await entry.waitFor({ state: "visible", timeout: 15000 });
    await entry.click();

    // 等待弹窗
    const modal = page.locator(".ant-modal").first();
    await modal.waitFor({ state: "visible", timeout: 10000 });
    await sleep(600);

    // 切换上传封面
    const tab = modal.locator('text=上传封面, text=上传图片, text=本地上传, .ant-tabs-tab:has-text("上传")').first();
    if (await tab.count()) {
      await tab.click();
      await sleep(400);
    }

    // 上传文件
    const fileInput = modal.locator('input[type="file"]').first();
    await fileInput.setInputFiles(absPath);
    console.log("[Playwright-ks] 已注入封面图片，等待渲染");
    await sleep(2000);

    // 选中 4:3 比例
    await selectRatio43Playwright(modal);
    await sleep(500);

    // 点击确定保存
    const confirmBtn = modal.locator('button.ant-btn-primary:has-text("确定"), button:has-text("确定"), button:has-text("完成")').first();
    await confirmBtn.click();
    console.log("[Playwright-ks] 已点击快手封面确定按钮");

    // 等待弹窗关闭
    try {
      await modal.waitFor({ state: "hidden", timeout: 5000 });
      console.log("[Playwright-ks] ✅ 快手封面设置完成并关闭弹窗");
    } catch (_) {}

    return true;
  }

  return false;
}

module.exports = { uploadCoverWithPlaywright };
