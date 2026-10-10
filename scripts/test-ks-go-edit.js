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

  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";

  // 点击【去编辑】按钮
  console.log("尝试点击【去编辑】按钮...");
  const editBtnRes = await win.webContents.executeJavaScript(`
    (() => {
      const btns = document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn');
      for (const b of btns) {
        if ((b.innerText || '').trim() === '去编辑') {
          b.click();
          return { clicked: true, text: b.innerText, cls: b.className };
        }
      }
      return { clicked: false };
    })()
  `);
  console.log("点击【去编辑】结果:", editBtnRes);
  await sleep(3000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-test-after-go-edit.png"), img.toPNG());
    console.log("📸 已保存点击去编辑后的截图: ks-test-after-go-edit.png");
  });

  const stateAfterGoEdit = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal');
      const text = modal ? modal.innerText.slice(0, 400) : '';
      const btns = Array.from(document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn')).map(b => b.innerText);
      return { text, btns };
    })()
  `);
  console.log("点击去编辑后弹窗状态:\n", JSON.stringify(stateAfterGoEdit, null, 2));

  win.destroy();
  app.quit();
});
