const { app, BrowserWindow, session } = require("electron");
if (app) {
  if (app.name !== "matrix-video") app.name = "matrix-video";
  app.commandLine.appendSwitch("ignore-certificate-errors");

  app.whenReady().then(async () => {
    const ses = session.fromPartition("persist:ai音乐快手");
    const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { session: ses, sandbox: false } });
    win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36");
    await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
    
    while (true) {
      const ok = await win.webContents.executeJavaScript("!!document.querySelector('input[type=file]')");
      if (ok) break;
      await new Promise(r => setTimeout(r, 500));
    }
    
    // 上传视频
    win.webContents.debugger.attach("1.3");
    const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const files = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: ["/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4"], nodeId: files.nodeIds[0] });
    
    while (true) {
      const ok = await win.webContents.executeJavaScript("!!document.querySelector('[class*=\"cover-full-editor\"], [class*=\"default-cover\"]')");
      if (ok) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // 点击封面
    await win.webContents.executeJavaScript(`
      const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      card.click();
      const b = card.querySelector('button, div, span');
      if (b) b.click();
    `);
    await new Promise(r => setTimeout(r, 2000));
    
    // 切换到【上传封面】Tab
    await win.webContents.executeJavaScript(`
      const tabs = document.querySelectorAll('div[class*="_header-title-item"]');
      for (const t of tabs) {
        if ((t.innerText || '').trim() === '上传封面') {
          t.click();
          break;
        }
      }
    `);
    await new Promise(r => setTimeout(r, 2000));
    
    const inputsInfo = await win.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('input[type=file]')).map(i => ({
        accept: i.accept,
        id: i.id,
        className: i.className,
        outerHTML: i.outerHTML,
        parentHTML: i.parentElement ? i.parentElement.outerHTML.slice(0, 200) : null
      }))
    `);
    console.log("INSPECT_INPUTS:", JSON.stringify(inputsInfo, null, 2));
    win.destroy();
    app.quit();
  });
}
