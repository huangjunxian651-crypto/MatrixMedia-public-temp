"use strict";

const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const fs = require("fs");

if (app.name !== "matrix-video") {
  app.name = "matrix-video";
}
app.commandLine.appendSwitch("ignore-certificate-errors");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:ai音乐快手");
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      session: ses,
      sandbox: false,
    },
  });

  win.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
  );

  const shotDir = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots";
  fs.mkdirSync(shotDir, { recursive: true });

  console.log("1. 正在加载快手视频发布页...");
  await win.loadURL("https://cp.kuaishou.com/article/publish/video?tabType=1");

  // 轮询等待 input[type="file"] 渲染完成
  console.log("等待发布页 input[type=file] 渲染...");
  for (let i = 0; i < 30; i++) {
    const hasInput = await win.webContents.executeJavaScript(`
      (() => !!document.querySelector('input[type="file"]'))()
    `);
    if (hasInput) break;
    await sleep(1000);
  }
  await sleep(1000);

  // 截取初始页面
  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-0-initial.png"), img.toPNG());
  });

  console.log("2. 注入视频文件...");
  const videoPath = "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4";
  
  // 查找上传 input
  const foundInput = await win.webContents.executeJavaScript(`
    (() => {
      const inputs = document.querySelectorAll('input[type="file"]');
      return inputs.length > 0;
    })()
  `);
  console.log("是否存在 file input:", foundInput);

  // 通过 debugger 或 executeJavaScript 触发上传
  // 使用 Chromium debugger 协议附加
  try {
    win.webContents.debugger.attach("1.3");
  } catch (err) {
    console.warn("debugger attach 失败:", err);
  }

  // 获取 DOM 树并上传视频
  const doc = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const fileNodes = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]'
  });
  console.log("找到 file inputs nodeIds:", fileNodes.nodeIds);

  if (fileNodes.nodeIds.length > 0) {
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
      files: [videoPath],
      nodeId: fileNodes.nodeIds[0]
    });
    console.log("✅ 视频已注入！等待视频解析与转码...");
  }

  // 等待视频转码完成（出现封面卡片）
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    ready = await win.webContents.executeJavaScript(`
      (() => {
        const video = document.querySelector('video, #preview-tours video');
        const coverCard = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
        return !!(video || coverCard);
      })()
    `);
    if (ready) break;
  }

  console.log("视频准备完毕状态:", ready);
  await sleep(3000);

  // 滚动到顶部
  await win.webContents.executeJavaScript(`window.scrollTo(0, 0); document.documentElement.scrollTop = 0;`);
  await sleep(1000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-1-video-ready.png"), img.toPNG());
  });

  // 分析封面区域的 DOM 和文字
  const coverSectionInfo = await win.webContents.executeJavaScript(`
    (() => {
      const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      if (!card) return { found: false };
      const parent = card.closest('[class*="form-item"], [class*="cover"], section') || card.parentElement;
      return {
        found: true,
        cardCls: card.className,
        cardHtml: card.outerHTML.slice(0, 300),
        parentText: parent ? parent.innerText : "",
        parentHtml: parent ? parent.outerHTML.slice(0, 500) : "",
      };
    })()
  `);
  console.log("封面区域 DOM 诊断:\n", JSON.stringify(coverSectionInfo, null, 2));

  // 点击封面卡片
  console.log("3. 点击封面卡片唤起弹窗...");
  await win.webContents.executeJavaScript(`
    (() => {
      const card = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      if (card) {
        card.scrollIntoView({ block: "center" });
        card.click();
        const b = card.querySelector('button, div, span');
        if (b) b.click();
      }
    })()
  `);
  await sleep(3000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-2-modal.png"), img.toPNG());
  });

  // 分析弹窗内的所有 Tabs 和选项
  const modalInfo = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal, [class*="modal"]') || document.body;
      const tabs = Array.from(modal.querySelectorAll('[role="tab"], .ant-tabs-tab, [class*="tab"]')).map(t => t.innerText);
      const buttons = Array.from(modal.querySelectorAll('button, .ant-btn, [role="button"]')).map(b => ({
        text: b.innerText,
        cls: b.className,
        disabled: b.disabled
      }));
      const ratios = Array.from(modal.querySelectorAll('[class*="radio"], [class*="ratio"], [class*="scale"]')).map(r => r.innerText);
      return { tabs, buttons, ratios, text: modal.innerText.slice(0, 600) };
    })()
  `);
  console.log("弹窗内部结构:\n", JSON.stringify(modalInfo, null, 2));

  // 切换到「上传封面」Tab
  console.log("4. 切换到「上传封面」Tab...");
  await win.webContents.executeJavaScript(`
    (() => {
      for (const el of document.querySelectorAll('*')) {
        const t = (el.textContent || '').trim();
        if ((t === '上传封面' || t === '本地上传') && el.children.length === 0) {
          el.click();
          if (el.parentElement) el.parentElement.click();
          break;
        }
      }
    })()
  `);
  await sleep(2000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-3-upload-tab.png"), img.toPNG());
  });

  // 注入封面图片
  console.log("5. 注入封面图片...");
  const coverPath = "/Users/jun10r/Pictures/142.JPG";
  const doc2 = await win.webContents.debugger.sendCommand("DOM.getDocument");
  const fileNodes2 = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", {
    nodeId: doc2.root.nodeId,
    selector: 'input[type="file"]'
  });
  console.log("弹窗内所有 file inputs nodeIds:", fileNodes2.nodeIds);
  // 排除第一个（主视频），使用后面的图片 input
  const imgNodeId = fileNodes2.nodeIds.length > 1 ? fileNodes2.nodeIds[fileNodes2.nodeIds.length - 1] : fileNodes2.nodeIds[0];
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
    files: [coverPath],
    nodeId: imgNodeId
  });
  console.log("✅ 封面图片已注入！等待 6 秒渲染...");
  await sleep(6000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-4-cover-injected.png"), img.toPNG());
  });

  // 检查此时左侧的比例列表和右下角按钮
  const cropStageInfo = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('.ant-modal, [class*="modal"]') || document.body;
      const ratios = [];
      for (const el of modal.querySelectorAll('*')) {
        const t = (el.textContent || '').trim();
        if ((t === '原始比例' || t === '4:3' || t === '3:4' || t === '1:1' || t === '9:16') && el.children.length === 0) {
          ratios.push({ text: t, tag: el.tagName, cls: el.className, parentCls: el.parentElement?.className });
        }
      }
      const buttons = Array.from(modal.querySelectorAll('button, .ant-btn')).map(b => ({
        text: b.innerText,
        cls: b.className
      }));
      return { ratios, buttons };
    })()
  `);
  console.log("裁剪阶段信息:\n", JSON.stringify(cropStageInfo, null, 2));

  // 点击 4:3 比例
  console.log("6. 点击 4:3 比例...");
  await win.webContents.executeJavaScript(`
    (() => {
      for (const el of document.querySelectorAll('*')) {
        const t = (el.textContent || '').trim();
        if (t === '4:3' && el.children.length === 0) {
          el.click();
          if (el.parentElement) el.parentElement.click();
          break;
        }
      }
    })()
  `);
  await sleep(2000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-5-ratio-selected.png"), img.toPNG());
  });

  // 分析右下角的【确认】和【去编辑】按钮的具体属性与绑定事件
  const btnAnalysis = await win.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn, [class*="modal"] button')).map(b => ({
        text: b.innerText,
        tagName: b.tagName,
        className: b.className,
        type: b.type,
        disabled: b.disabled,
        rect: b.getBoundingClientRect()
      }));
      return btns;
    })()
  `);
  console.log("按钮深度分析:\n", JSON.stringify(btnAnalysis, null, 2));

  // 点击【确认】
  console.log("7. 点击【确认】按钮并观察网络请求与弹窗关闭...");
  const confirmResult = await win.webContents.executeJavaScript(`
    (() => {
      for (const b of document.querySelectorAll('.ant-modal button, .ant-modal .ant-btn, [class*="modal"] button')) {
        const t = (b.innerText || '').trim();
        if (t === '确认') {
          b.click();
          return { clicked: true, text: t, cls: b.className };
        }
      }
      return { clicked: false };
    })()
  `);
  console.log("确认按钮点击结果:", confirmResult);

  // 等待 5 秒观察弹窗是否关闭
  await sleep(5000);

  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(path.join(shotDir, "ks-flow-6-after-confirm.png"), img.toPNG());
  });

  // 分析主页面的封面卡片与右侧手机模型
  const postConfirmInfo = await win.webContents.executeJavaScript(`
    (() => {
      const modalStillOpen = !!document.querySelector('.ant-modal:not([style*="display: none"])');
      const coverCard = document.querySelector('[class*="cover-full-editor"], [class*="default-cover"]');
      const coverImg = coverCard ? coverCard.querySelector('img')?.src : null;
      
      // 检查右侧手机预览
      const phoneContainer = document.querySelector('[class*="preview"], [class*="phone"], [class*="mobile"]');
      const phoneVideo = document.querySelector('video');
      const phoneCover = phoneContainer ? phoneContainer.querySelector('img')?.src : null;

      // 检查页面上是否有关于封面的提示或警告
      const warnings = Array.from(document.querySelectorAll('[class*="warn"], [class*="alert"], [class*="error"]')).map(w => w.innerText);

      return {
        modalStillOpen,
        coverImg: coverImg ? coverImg.slice(0, 100) : null,
        phoneCover: phoneCover ? phoneCover.slice(0, 100) : null,
        warnings
      };
    })()
  `);
  console.log("点击确认后的主页面状态:\n", JSON.stringify(postConfirmInfo, null, 2));

  try { win.webContents.debugger.detach(); } catch (_) {}
  win.destroy();
  app.quit();
});
