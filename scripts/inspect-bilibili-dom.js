"use strict";

const puppeteer = require("puppeteer-core");

async function main() {
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:65148" });
  const pages = await browser.pages();
  const blblPage = pages.find(p => p.url().includes("bilibili.com"));
  if (!blblPage) {
    console.log("未找到 B 站页面");
    browser.disconnect();
    return;
  }
  console.log("找到 B 站页面:", blblPage.url());

  const info = await blblPage.evaluate(() => {
    // 1. 查找分区下拉框
    const typeContainers = [];
    document.querySelectorAll('[class*="type"], [class*="select"]').forEach(el => {
      if ((el.textContent || "").includes("音乐") || (el.textContent || "").includes("影视") || (el.textContent || "").includes("分区")) {
        typeContainers.push({
          tagName: el.tagName,
          className: el.className,
          text: el.textContent.trim().slice(0, 50),
        });
      }
    });

    // 2. 查找封面相关元素
    const coverElements = [];
    document.querySelectorAll('.add-text, .cover-editor, [class*="cover"], [class*="upload"]').forEach(el => {
      coverElements.push({
        tagName: el.tagName,
        className: el.className,
        text: el.textContent.trim().slice(0, 50),
      });
    });

    // 3. 所有 input[type="file"]
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(inp => ({
      className: inp.className,
      accept: inp.accept,
      parentClass: inp.parentElement?.className,
      grandParentClass: inp.parentElement?.parentElement?.className,
    }));

    return { typeContainers: typeContainers.slice(0, 10), coverElements: coverElements.slice(0, 15), fileInputs };
  });

  console.log("DOM 探查结果:", JSON.stringify(info, null, 2));
  browser.disconnect();
}

main().catch(console.error);
