"use strict";

const { app, BrowserWindow, session } = require("electron");

if (app.name !== "matrix-video") app.name = "matrix-video";
app.commandLine.appendSwitch("ignore-certificate-errors");

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:ai音乐快手");
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: false } });
  win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36");
  await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
  
  // 等待渲染并上传视频
  while (true) {
    const ok = await win.webContents.executeJavaScript("!!document.querySelector('input[type=file]')");
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  win.webContents.debugger.attach("1.3");
  const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const files = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: ["/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4"], nodeId: files.nodeIds[0] });
  
  console.log("等待视频就绪...");
  while (true) {
    const ok = await win.webContents.executeJavaScript("!!document.querySelector('[class*=\"cover-full-editor\"], [class*=\"default-cover\"]')");
    if (ok) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // 点击封面卡片
  await win.webContents.executeJavaScript(`
    const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
    card.click();
    const b = card.querySelector('button, div, span');
    if (b) b.click();
  `);
  
  // 等待弹窗出现
  await new Promise(r => setTimeout(r, 2000));
  
  // 获取弹窗 header 和所有包含“封面”的元素
  const tabsInfo = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal, [class*="modal"]') || document.body;
      const res = [];
      for (const el of modal.querySelectorAll('*')) {
        const t = (el.innerText || '').trim();
        if (t === '封面截取' || t === '上传封面') {
          const rect = el.getBoundingClientRect();
          res.push({
            tag: el.tagName,
            cls: el.className,
            text: t,
            html: el.outerHTML,
            childrenCount: el.children.length,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          });
        }
      }
      return res;
    })()
  `);
  console.log("快手弹窗 Header/Tabs 详细元素:\n", JSON.stringify(tabsInfo, null, 2));

  // 尝试点击「上传封面」并等待
  const switchRes = await win.webContents.executeJavaScript(`
    (() => {
      for (const el of document.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === '上传封面') {
          el.click();
          return { clicked: true, tag: el.tagName, cls: el.className };
        }
      }
      return { clicked: false };
    })()
  `);
  console.log("点击上传封面结果:", switchRes);
  await new Promise(r => setTimeout(r, 2000));

  // 检查切换后的状态
  const afterSwitch = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal, [class*="modal"]') || document.body;
      return {
        text: modal.innerText.slice(0, 300),
        hasUploadBtn: Array.from(modal.querySelectorAll('*')).some(el => (el.innerText || '').includes('上传图片'))
      };
    })()
  `);
  console.log("切换后状态:\n", JSON.stringify(afterSwitch, null, 2));

  win.destroy();
  app.quit();
});
