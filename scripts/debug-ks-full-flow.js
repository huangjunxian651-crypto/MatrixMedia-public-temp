const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");

if (app) {
  if (app.name !== "matrix-video") app.name = "matrix-video";
  app.commandLine.appendSwitch("ignore-certificate-errors");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";

  app.whenReady().then(async () => {
    const ses = session.fromPartition("persist:ai音乐快手");
    const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { session: ses, sandbox: false } });
    win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36");
    
    // 监听所有网络请求，观察封面上传相关的 API
    ses.webRequest.onCompleted({ urls: ["*://*/*"] }, (details) => {
      if (details.url.includes("upload") || details.url.includes("cover") || details.url.includes("image") || details.url.includes("video")) {
        console.log(`[NET] ${details.statusCode} ${details.method} ${details.url.slice(0, 100)}`);
      }
    });

    console.log("1. 正在加载发布页面...");
    await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
    
    while (true) {
      const ok = await win.webContents.executeJavaScript("!!document.querySelector('input[type=file]')");
      if (ok) break;
      await sleep(500);
    }
    
    console.log("2. 正在上传视频...");
    win.webContents.debugger.attach("1.3");
    const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const files = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: ["/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4"], nodeId: files.nodeIds[0] });
    
    console.log("3. 等待视频就绪与封面卡片渲染...");
    while (true) {
      const ok = await win.webContents.executeJavaScript("!!document.querySelector('[class*=\"cover-full-editor\"], [class*=\"default-cover\"]')");
      if (ok) break;
      await sleep(1000);
    }
    await sleep(2000);

    // 步骤 0 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step0-entry.png"), img.toPNG());
      console.log("📸 已保存步骤0截图: ks-step0-entry.png");
    });

    console.log("4. 点击封面卡片打开弹窗...");
    await win.webContents.executeJavaScript(`
      const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      card.click();
      const b = card.querySelector('button, div, span');
      if (b) b.click();
    `);
    await sleep(2500);

    // 步骤 1 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step1-modal-opened.png"), img.toPNG());
      console.log("📸 已保存步骤1截图: ks-step1-modal-opened.png");
    });

    console.log("5. 切换到【上传封面】Tab...");
    await win.webContents.executeJavaScript(`
      const tabs = document.querySelectorAll('div[class*="_header-title-item"]');
      for (const t of tabs) {
        if ((t.innerText || '').trim() === '上传封面') {
          t.click();
          break;
        }
      }
    `);
    await sleep(1500);

    // 步骤 2 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step2-tab-switched.png"), img.toPNG());
      console.log("📸 已保存步骤2截图: ks-step2-tab-switched.png");
    });

    console.log("6. 注入封面图片到【上传封面】专属 input...");
    const doc2 = await win.webContents.debugger.sendCommand("DOM.getDocument");
    // 专门定位 cropper-upload 下的 input，或者最后一个 input
    const coverInputs = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", {
      nodeId: doc2.root.nodeId,
      selector: "div[class*='cropper-upload'] input[type=file]"
    });
    const coverNodeId = coverInputs.nodeIds.length > 0 ? coverInputs.nodeIds[0] : (await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc2.root.nodeId, selector: "input[type=file]" })).nodeIds.slice(-1)[0];
    
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
      files: ["/Users/jun10r/Pictures/142.JPG"],
      nodeId: coverNodeId
    });

    console.log("等待裁剪画布加载...");
    for (let i = 0; i < 20; i++) {
      const cropReady = await win.webContents.executeJavaScript(`
        (() => Array.from(document.querySelectorAll('*')).some(el => (el.innerText || '').trim() === '清空上传'))()
      `);
      if (cropReady) break;
      await sleep(500);
    }
    await sleep(2000);

    // 步骤 3 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step3-image-injected.png"), img.toPNG());
      console.log("📸 已保存步骤3截图: ks-step3-image-injected.png");
    });

    console.log("7. 选中 4:3 比例...");
    const ratioRes = await win.webContents.executeJavaScript(`
      (() => {
        const ratios = document.querySelectorAll('div[class*="_ratio-item"], [class*="ratio"]');
        for (const r of ratios) {
          if ((r.innerText || '').includes('4:3') && !(r.innerText || '').includes('3:4')) {
            r.click();
            const s = r.querySelector('span');
            if (s) s.click();
            return { ok: true, text: r.innerText };
          }
        }
        return { ok: false };
      })()
    `);
    console.log("选中 4:3 结果:", ratioRes);
    await sleep(1500);

    // 步骤 4 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step4-ratio-selected.png"), img.toPNG());
      console.log("📸 已保存步骤4截图: ks-step4-ratio-selected.png");
    });

    // 打印当前模态框里的所有按钮
    const modalButtons = await win.webContents.executeJavaScript(`
      (() => {
        return Array.from(document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn, .ant-modal div[role=button]')).map(b => ({
          text: (b.innerText || '').trim(),
          className: b.className,
          rect: b.getBoundingClientRect()
        }));
      })()
    `);
    console.log("模态框底部按钮信息:", JSON.stringify(modalButtons, null, 2));

    console.log("8. 点击【确认】保存裁剪封面...");
    const firstConfirmResult = await win.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn'));
        for (const b of btns) {
          if ((b.innerText || '').trim() === '确认') {
            b.click();
            return { ok: true, text: b.innerText };
          }
        }
        return { ok: false };
      })()
    `);
    console.log("第一次点击【确认】:", firstConfirmResult);
    await sleep(3000);

    // 观察弹窗状态
    for (let s = 1; s <= 5; s++) {
      const state = await win.webContents.executeJavaScript(`
        (() => {
          const modal = document.querySelector('.ant-modal');
          const isClosed = !modal || modal.offsetParent === null || modal.style.display === 'none';
          const activeTab = document.querySelector('div[class*="_header-title-item-active"]')?.innerText;
          const btns = Array.from(document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn')).map(b => (b.innerText || '').trim());
          const hasSpin = !!document.querySelector('.ant-modal .ant-spin, .ant-modal [class*="loading"]');
          return { isClosed, activeTab, btns, hasSpin };
        })()
      `);
      console.log(`第 ${s} 秒第一次确认后状态:`, JSON.stringify(state));
      await sleep(1000);
    }

    // 检查是否回到了【封面截取】Tab，如果回到了且有确认按钮，再点一次！
    const needSecondConfirm = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector('.ant-modal');
        if (!modal || modal.offsetParent === null || modal.style.display === 'none') return false;
        const btns = Array.from(modal.querySelectorAll('button, .ant-btn'));
        for (const b of btns) {
          if ((b.innerText || '').trim() === '确认') {
            b.click();
            return true;
          }
        }
        return false;
      })()
    `);
    console.log("是否触发第二次点击【确认】:", needSecondConfirm);

    // 等待弹窗真正关闭
    console.log("等待弹窗关闭...");
    let closed = false;
    for (let i = 0; i < 15; i++) {
      closed = await win.webContents.executeJavaScript(`
        (() => {
          const modal = document.querySelector('.ant-modal');
          return !modal || modal.offsetParent === null || modal.style.display === 'none';
        })()
      `);
      if (closed) break;
      await sleep(1000);
    }
    console.log("弹窗是否彻底关闭:", closed);

    await sleep(3000);

    // 步骤 5 截图（发布主页面上的封面生效状态）
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step5-cover-confirmed.png"), img.toPNG());
      console.log("📸 已保存步骤5截图: ks-step5-cover-confirmed.png");
    });

    // 检查主页面封面卡片中的图片 src
    const mainCoverCheck = await win.webContents.executeJavaScript(`
      (() => {
        const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
        const img = card ? card.querySelector('img') : null;
        return {
          hasCard: !!card,
          imgSrc: img ? img.src : null,
          cardHtml: card ? card.outerHTML.slice(0, 300) : null
        };
      })()
    `);
    console.log("发布页主封面卡片检查结果:", JSON.stringify(mainCoverCheck, null, 2));

    win.destroy();
    app.quit();
  });
}
