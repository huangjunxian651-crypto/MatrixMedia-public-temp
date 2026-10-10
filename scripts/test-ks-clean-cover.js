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
    
    console.log("1. 加载快手发布页...");
    await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");
    
    while (true) {
      const ok = await win.webContents.executeJavaScript("!!document.querySelector('input[type=file]')");
      if (ok) break;
      await sleep(500);
    }
    
    console.log("2. 注入测试视频...");
    win.webContents.debugger.attach("1.3");
    const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const files = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { files: ["/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4"], nodeId: files.nodeIds[0] });
    
    console.log("3. 等待视频上传并就绪...");
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

    console.log("4. 点击封面设置入口...");
    await win.webContents.executeJavaScript(`
      const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      card.click();
      const b = card.querySelector('button, div, span');
      if (b) b.click();
    `);
    
    // 等待弹窗真正打开
    for (let i = 0; i < 20; i++) {
      const opened = await win.webContents.executeJavaScript("!!document.querySelector('.ant-modal')");
      if (opened) break;
      await sleep(500);
    }
    await sleep(1000);

    // 步骤 1 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step1-modal-opened.png"), img.toPNG());
      console.log("📸 已保存步骤1截图: ks-step1-modal-opened.png");
    });

    console.log("5. 等待弹窗内的初始加载菊花（加载中）彻底结束...");
    for (let i = 0; i < 30; i++) {
      const isLoading = await win.webContents.executeJavaScript(`
        (() => {
          const modal = document.querySelector('.ant-modal');
          if (!modal) return false;
          return Array.from(modal.querySelectorAll('*')).some(el => {
            const t = (el.innerText || '').trim();
            return t === '加载中' || el.className.includes('spin') || el.className.includes('loading');
          });
        })()
      `);
      if (!isLoading) {
        console.log(`初始加载在第 ${i * 500}ms 结束`);
        break;
      }
      await sleep(500);
    }
    await sleep(1000);

    console.log("6. 点击并确保切换到【上传封面】Tab...");
    for (let attempt = 1; attempt <= 10; attempt++) {
      const tabActive = await win.webContents.executeJavaScript(`
        (() => {
          const tabs = Array.from(document.querySelectorAll('div[class*="_header-title-item"]'));
          const uploadTab = tabs.find(t => (t.innerText || '').trim() === '上传封面');
          if (!uploadTab) return { found: false };
          const isActive = uploadTab.className.includes('active') || uploadTab.className.includes('Active');
          if (!isActive) {
            uploadTab.click();
          }
          return { found: true, isActive };
        })()
      `);
      console.log(`[尝试 ${attempt}] 上传封面 Tab 状态:`, tabActive);
      if (tabActive.isActive) {
        console.log("✅ 【上传封面】Tab 已成功激活！");
        break;
      }
      await sleep(800);
    }

    // 等待【上传图片】按钮渲染
    for (let i = 0; i < 20; i++) {
      const hasUploadBtn = await win.webContents.executeJavaScript(`
        (() => {
          const modal = document.querySelector('.ant-modal');
          return modal && Array.from(modal.querySelectorAll('*')).some(el => (el.innerText || '').trim() === '上传图片');
        })()
      `);
      if (hasUploadBtn) {
        console.log("✅ 找到【上传图片】按钮");
        break;
      }
      await sleep(500);
    }
    await sleep(1000);

    // 步骤 2 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step2-tab-switched.png"), img.toPNG());
      console.log("📸 已保存步骤2截图: ks-step2-tab-switched.png");
    });

    console.log("7. 定位并注入本地封面图片 /Users/jun10r/Pictures/142.JPG...");
    const doc2 = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const coverInputs = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", {
      nodeId: doc2.root.nodeId,
      selector: "div[class*='cropper-upload'] input[type=file]"
    });
    const coverNodeId = coverInputs.nodeIds.length > 0 ? coverInputs.nodeIds[0] : (await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: doc2.root.nodeId, selector: "input[type=file]" })).nodeIds.slice(-1)[0];
    
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
      files: ["/Users/jun10r/Pictures/142.JPG"],
      nodeId: coverNodeId
    });

    console.log("8. 等待裁剪画布渲染出来（等待【清空上传】出现）...");
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

    console.log("9. 选中 4:3 比例...");
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

    console.log("10. 点击【确认】按钮保存封面...");
    const confirmRes = await win.webContents.executeJavaScript(`
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
    console.log("点击【确认】结果:", confirmRes);

    console.log("11. 等待保存请求完成与弹窗自然关闭...");
    let isClosed = false;
    for (let i = 0; i < 20; i++) {
      isClosed = await win.webContents.executeJavaScript(`
        (() => {
          const modal = document.querySelector('.ant-modal');
          return !modal || modal.offsetParent === null || modal.style.display === 'none';
        })()
      `);
      if (isClosed) {
        console.log(`✅ 弹窗在第 ${i * 500}ms 自然关闭！`);
        break;
      }
      await sleep(500);
    }

    // 给足等待时间同步数据
    await sleep(5000);

    // 步骤 5 截图
    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step5-cover-confirmed.png"), img.toPNG());
      console.log("📸 已保存步骤5截图: ks-step5-cover-confirmed.png");
    });

    // 检查右侧手机模型【预览封面】
    console.log("12. 点击右侧手机模型上方【预览封面】切换检查...");
    await win.webContents.executeJavaScript(`
      (() => {
        for (const el of document.querySelectorAll('*')) {
          if ((el.innerText || '').trim() === '预览封面') {
            el.click();
            break;
          }
        }
      })()
    `);
    await sleep(2000);

    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-step6-phone-preview-cover.png"), img.toPNG());
      console.log("📸 已保存手机预览封面截图: ks-step6-phone-preview-cover.png");
    });

    const finalReport = await win.webContents.executeJavaScript(`
      (() => {
        const coverCard = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
        const img = coverCard ? coverCard.querySelector('img') : null;
        return {
          cardImgSrc: img ? img.src : null,
          cardImgDisplay: img ? window.getComputedStyle(img).display : null
        };
      })()
    `);
    console.log("最终报告:", JSON.stringify(finalReport, null, 2));

    win.destroy();
    app.quit();
  });
}
