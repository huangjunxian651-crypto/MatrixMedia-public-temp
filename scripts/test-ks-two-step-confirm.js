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

  // 等待【上传图片】出现
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

  // 等待裁剪画布
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

  // 检查此时【确认】和【去编辑】按钮的真实点击效果
  console.log("第一次点击【确认】按钮...");
  await win.webContents.executeJavaScript(`
    const btns = document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn');
    for (const b of btns) {
      if ((b.innerText || '').trim() === '确认') {
        b.click();
        break;
      }
    }
  `);
  await sleep(2500);

  // 检查弹窗此时的状态
  const statusAfterFirstConfirm = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal');
      const isClosed = !modal || modal.offsetParent === null || modal.style.display === 'none';
      const activeTab = document.querySelector('div[class*="_header-title-item-active"]')?.innerText;
      const isLoading = Array.from(document.querySelectorAll('*')).some(el => (el.innerText || '').trim() === '加载中');
      const text = modal ? modal.innerText.slice(0, 300) : '';
      return { isClosed, activeTab, isLoading, text };
    })()
  `);
  console.log("第一次确认后弹窗状态:", statusAfterFirstConfirm);

  // 如果中间在加载中，等待加载中消失
  if (statusAfterFirstConfirm.isLoading) {
    console.log("等待切回后的加载中消失...");
    for (let i = 0; i < 20; i++) {
      const loading = await win.webContents.executeJavaScript(`
        (() => Array.from(document.querySelectorAll('*')).some(el => (el.innerText || '').trim() === '加载中'))()
      `);
      if (!loading) break;
      await sleep(500);
    }
    await sleep(1000);
  }

  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-test-after-first-confirm.png"), img.toPNG());
    console.log("📸 已保存第一次确认后截图: ks-test-after-first-confirm.png");
  });

  // 如果弹窗依然未关闭，执行第二次点击【确认】！
  if (!statusAfterFirstConfirm.isClosed) {
    console.log("执行第二次点击【确认】按钮！");
    const secondConfirmRes = await win.webContents.executeJavaScript(`
      (() => {
        const btns = document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn');
        for (const b of btns) {
          if ((b.innerText || '').trim() === '确认') {
            b.click();
            return { clicked: true, text: b.innerText };
          }
        }
        return { clicked: false };
      })()
    `);
    console.log("第二次点击【确认】结果:", secondConfirmRes);
    await sleep(3000);

    // 检查弹窗是否关闭
    const statusAfterSecondConfirm = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector('.ant-modal');
        const isClosed = !modal || modal.offsetParent === null || modal.style.display === 'none';
        return { isClosed };
      })()
    `);
    console.log("第二次确认后弹窗状态:", statusAfterSecondConfirm);

    await win.webContents.capturePage().then((img) => {
      fs.writeFileSync(path.join(shotDir, "ks-test-after-second-confirm.png"), img.toPNG());
      console.log("📸 已保存第二次确认后截图: ks-test-after-second-confirm.png");
    });
  }

  // 检查发布主页面的封面卡片与右侧手机模型预览
  const finalPageInfo = await win.webContents.executeJavaScript(`
    (() => {
      const coverCard = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      const cardImg = coverCard ? coverCard.querySelector('img')?.src : null;
      
      const phoneCoverImg = document.querySelector('[class*="preview"] img, [class*="phone"] img, [class*="mobile"] img')?.src;
      
      return {
        cardImg: cardImg ? cardImg.slice(0, 80) : null,
        phoneCoverImg: phoneCoverImg ? phoneCoverImg.slice(0, 80) : null,
        pageText: document.body.innerText.slice(0, 400)
      };
    })()
  `);
  console.log("最终主页面状态:\n", JSON.stringify(finalPageInfo, null, 2));

  win.destroy();
  app.quit();
});
