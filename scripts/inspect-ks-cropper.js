const { app, BrowserWindow, session } = require("electron");
if (app) {
  if (app.name !== "matrix-video") app.name = "matrix-video";
  app.commandLine.appendSwitch("ignore-certificate-errors");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  app.whenReady().then(async () => {
    const ses = session.fromPartition("persist:ai音乐快手");
    const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { session: ses, sandbox: false } });
    win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36");
    
    await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
    while (true) {
      if (await win.webContents.executeJavaScript("!!document.querySelector('input[type=file]')")) break;
      await sleep(500);
    }
    
    win.webContents.debugger.attach("1.3");
    const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const files = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: ["/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4"], nodeId: files.nodeIds[0] });
    
    while (true) {
      if (await win.webContents.executeJavaScript("!!document.querySelector('[class*=\"cover-full-editor\"], [class*=\"default-cover\"]')")) break;
      await sleep(1000);
    }
    
    // 打开封面
    await win.webContents.executeJavaScript(`
      document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]').click();
    `);
    await sleep(2000);
    
    // 等待初始加载
    for (let i = 0; i < 30; i++) {
      const loading = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.ant-modal *')).some(el => (el.innerText || '').trim() === '加载中')
      `);
      if (!loading) break;
      await sleep(500);
    }
    
    // 切换到【上传封面】
    await win.webContents.executeJavaScript(`
      for (const t of document.querySelectorAll('div[class*="_header-title-item"]')) {
        if ((t.innerText || '').trim() === '上传封面') t.click();
      }
    `);
    await sleep(1500);
    
    // 注入图片
    const doc2 = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const coverInputs = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc2.root.nodeId, selector: "div[class*='cropper-upload'] input[type=file]" });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
      files: ["/Users/jun10r/Pictures/142.JPG"],
      nodeId: coverInputs.nodeIds[0]
    });
    
    for (let i = 0; i < 20; i++) {
      const ready = await win.webContents.executeJavaScript("!!Array.from(document.querySelectorAll('*')).find(e => (e.innerText||'').trim() === '清空上传')");
      if (ready) break;
      await sleep(500);
    }
    await sleep(2000);
    
    // 检查裁剪区 DOM
    const cropperInfo = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector('.ant-modal');
        const cropper = modal.querySelector('[class*="cropper"], [class*="cut"]');
        const imgs = Array.from(modal.querySelectorAll('img')).map(i => ({ src: i.src.slice(0, 80), w: i.naturalWidth, h: i.naturalHeight }));
        const canvases = Array.from(modal.querySelectorAll('canvas')).map(c => ({ w: c.width, h: c.height }));
        return { cropperHtml: cropper ? cropper.outerHTML.slice(0, 500) : null, imgs, canvases };
      })()
    `);
    console.log("CROPPER_INFO:", JSON.stringify(cropperInfo, null, 2));
    
    win.destroy();
    app.quit();
  });
}
