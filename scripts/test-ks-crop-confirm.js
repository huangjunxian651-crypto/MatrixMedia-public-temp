"use strict";

const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");

if (app.name !== "matrix-video") app.name = "matrix-video";
app.commandLine.appendSwitch("ignore-certificate-errors");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:ai音乐快手");
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: false } });
  win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36");
  await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
  
  // 等待渲染并上传视频
  while (true) {
    const ok = await win.webContents.executeJavaScript("!!document.querySelector('input[type=file]')");
    if (ok) break;
    await sleep(500);
  }
  win.webContents.debugger.attach("1.3");
  const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const files = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: ["/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4"], nodeId: files.nodeIds[0] });
  
  console.log("等待视频就绪...");
  while (true) {
    const ok = await win.webContents.executeJavaScript("!!document.querySelector('[class*=\"cover-full-editor\"], [class*=\"default-cover\"]')");
    if (ok) break;
    await sleep(1000);
  }
  
  // 点击封面卡片
  await win.webContents.executeJavaScript(`
    const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
    card.click();
    const b = card.querySelector('button, div, span');
    if (b) b.click();
  `);
  
  // 等待弹窗
  await sleep(2000);

  // 点击【上传封面】Tab 并等待它变成 active
  console.log("正在点击【上传封面】Tab...");
  await win.webContents.executeJavaScript(`
    const tabs = document.querySelectorAll('div[class*="_header-title-item"]');
    for (const t of tabs) {
      if ((t.innerText || '').trim() === '上传封面') {
        t.click();
        break;
      }
    }
  `);

  // 等待【上传图片】按钮出现
  console.log("等待【上传图片】按钮渲染...");
  for (let i = 0; i < 20; i++) {
    const hasUploadBtn = await win.webContents.executeJavaScript(`
      (() => {
        for (const el of document.querySelectorAll('*')) {
          if ((el.innerText || '').trim() === '上传图片') return true;
        }
        return false;
      })()
    `);
    if (hasUploadBtn) break;
    await sleep(500);
  }

  // 注入封面图片
  console.log("正在注入封面图片 /Users/jun10r/Pictures/142.JPG...");
  const doc2 = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const files2 = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc2.root.nodeId, selector: "input[type=file]" });
  console.log("当前所有 file inputs:", files2.nodeIds);
  const coverNodeId = files2.nodeIds[files2.nodeIds.length - 1];
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
    files: ["/Users/jun10r/Pictures/142.JPG"],
    nodeId: coverNodeId
  });

  // 等待裁剪画布渲染出来（等待【清空上传】或比例组件出现）
  console.log("等待裁剪界面渲染...");
  for (let i = 0; i < 20; i++) {
    const cropReady = await win.webContents.executeJavaScript(`
      (() => {
        for (const el of document.querySelectorAll('*')) {
          if ((el.innerText || '').trim() === '清空上传') return true;
        }
        return false;
      })()
    `);
    if (cropReady) break;
    await sleep(500);
  }
  await sleep(2000);

  // 选中 4:3 比例
  console.log("正在选中 4:3 比例...");
  const selectRatioRes = await win.webContents.executeJavaScript(`
    (() => {
      const ratios = document.querySelectorAll('div[class*="_ratio-item"], [class*="ratio"]');
      for (const r of ratios) {
        if ((r.innerText || '').includes('4:3') && !(r.innerText || '').includes('3:4')) {
          r.click();
          const s = r.querySelector('span');
          if (s) s.click();
          return { clicked: true, text: r.innerText, cls: r.className };
        }
      }
      return { clicked: false };
    })()
  `);
  console.log("选中 4:3 结果:", selectRatioRes);
  await sleep(1500);

  // 截取此时的弹窗画面
  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-test-crop-before-confirm.png"), img.toPNG());
    console.log("📸 已保存点击确认前弹窗截图: ks-test-crop-before-confirm.png");
  });

  // 点击【确认】按钮
  console.log("正在点击【确认】按钮...");
  const confirmRes = await win.webContents.executeJavaScript(`
    (() => {
      const btns = document.querySelectorAll('button, .ant-btn');
      for (const b of btns) {
        if ((b.innerText || '').trim() === '确认') {
          b.click();
          return { clicked: true, text: b.innerText, cls: b.className };
        }
      }
      return { clicked: false };
    })()
  `);
  console.log("点击【确认】结果:", confirmRes);

  // 连续 8 秒监测弹窗是否关闭以及 DOM 变化
  for (let s = 1; s <= 8; s++) {
    await sleep(1000);
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector('.ant-modal, [class*="modal"]');
        const isClosed = !modal || modal.offsetParent === null || modal.style.display === 'none';
        const coverCard = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
        const img = coverCard ? coverCard.querySelector('img')?.src : null;
        return { s: ${s}, isClosed, coverImgPrefix: img ? img.slice(0, 40) : null };
      })()
    `);
    console.log(`[秒 ${s}] 弹窗状态:`, state);
    if (state.isClosed) {
      console.log("✅ 弹窗已在第", s, "秒成功关闭！");
      break;
    }
  }

  // 截取点击确认后的页面
  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-test-after-confirm.png"), img.toPNG());
    console.log("📸 已保存确认后页面截图: ks-test-after-confirm.png");
  });

  win.destroy();
  app.quit();
});
