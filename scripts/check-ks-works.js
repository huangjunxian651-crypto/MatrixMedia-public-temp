"use strict";

const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const fs = require("fs");

if (app.name !== "matrix-video") {
  app.name = "matrix-video";
}
app.commandLine.appendSwitch("ignore-certificate-errors");

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

  console.log("正在打开快手作品管理页面...");
  await win.loadURL("https://cp.kuaishou.com/article/manage/video");

  await new Promise((r) => setTimeout(r, 6000));

  const shotPath = "/Users/jun10r/Documents/MatrixMedia/playwright-test-shots/ks-real-works-list.png";
  await win.webContents.capturePage().then((img) => {
    fs.writeFileSync(shotPath, img.toPNG());
    console.log("📸 已截取快手作品列表截图:", shotPath);
  });

  const works = await win.webContents.executeJavaScript(`
    (() => {
      const list = [];
      const rows = document.querySelectorAll('tr, [class*="work-item"], [class*="video-item"], [class*="card"]');
      for (const r of rows) {
        const text = r.innerText || "";
        const img = r.querySelector('img')?.src;
        if (text.length > 5 && img) {
          list.push({ text: text.slice(0, 100), img });
        }
      }
      return {
        url: window.location.href,
        title: document.title,
        worksCount: list.length,
        works: list.slice(0, 5),
        bodySnippet: document.body.innerText.slice(0, 300)
      };
    })()
  `);

  console.log("作品数据:", JSON.stringify(works, null, 2));

  win.destroy();
  app.quit();
});
