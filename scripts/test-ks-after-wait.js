"use strict";

const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");

if (app.name !== "matrix-video") app.name = "matrix-video";
app.commandLine.appendSwitch("ignore-certificate-errors");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:ai音乐快手");
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { session: ses, sandbox: false } });
  win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36");
  await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
  
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
  
  // 打开封面弹窗
  await win.webContents.executeJavaScript(`
    const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
    card.click();
    const b = card.querySelector('button, div, span');
    if (b) b.click();
  `);
  await sleep(2000);

  // 切换到【上传封面】Tab
  console.log("切换到【上传封面】Tab...");
  await win.webContents.executeJavaScript(`
    const tabs = document.querySelectorAll('div[class*="_header-title-item"]');
    for (const t of tabs) {
      if ((t.innerText || '').trim() === '上传封面') {
        t.click();
        break;
      }
    }
  `);

  for (let i = 0; i < 20; i++) {
    const hasUploadBtn = await win.webContents.executeJavaScript(`
      (() => Array.from(document.querySelectorAll('*')).some(el => (el.innerText || '').trim() === '上传图片'))()
    `);
    if (hasUploadBtn) break;
    await sleep(500);
  }

  // 注入图片
  console.log("注入封面图片...");
  const doc2 = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const files2 = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc2.root.nodeId, selector: "input[type=file]" });
  const coverNodeId = files2.nodeIds[files2.nodeIds.length - 1];
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
    files: ["/Users/jun10r/Pictures/142.JPG"],
    nodeId: coverNodeId
  });

  for (let i = 0; i < 20; i++) {
    const cropReady = await win.webContents.executeJavaScript(`
      (() => Array.from(document.querySelectorAll('*')).some(el => (el.innerText || '').trim() === '清空上传'))()
    `);
    if (cropReady) break;
    await sleep(500);
  }
  await sleep(2000);

  // 选中 4:3 比例
  console.log("选中 4:3 比例...");
  await win.webContents.executeJavaScript(`
    const ratios = document.querySelectorAll('div[class*="_ratio-item"], [class*="ratio"]');
    for (const r of ratios) {
      if ((r.innerText || '').includes('4:3') && !(r.innerText || '').includes('3:4')) {
        r.click();
        const s = r.querySelector('span');
        if (s) s.click();
        break;
      }
    }
  `);
  await sleep(1500);

  // 此时点击【确认】
  console.log("点击【确认】按钮...");
  await win.webContents.executeJavaScript(`
    const btns = document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn');
    for (const b of btns) {
      if ((b.innerText || '').trim() === '确认') {
        b.click();
        break;
      }
    }
  `);

  // 等待切回【封面截取】后完整加载 8 秒
  console.log("等待切回后彻底加载 8 秒...");
  await sleep(8000);

  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-test-after-wait-8s.png"), img.toPNG());
    console.log("📸 已保存等待8秒截图: ks-test-after-wait-8s.png");
  });

  // 分析此时弹窗中间的画面与所有图片元素
  const midImages = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal');
      const imgs = Array.from(modal.querySelectorAll('img, canvas')).map(el => ({
        tag: el.tagName,
        src: el.src ? el.src.slice(0, 100) : null,
        width: el.width,
        height: el.height
      }));
      const text = modal ? modal.innerText.slice(0, 300) : '';
      return { imgs, text };
    })()
  `);
  console.log("切回后弹窗内部画布/图片状态:\n", JSON.stringify(midImages, null, 2));

  win.destroy();
  app.quit();
});
