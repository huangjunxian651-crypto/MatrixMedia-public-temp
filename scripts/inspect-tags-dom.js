"use strict";

const puppeteer = require("puppeteer-core");

async function main() {
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:50191" }).catch(() => null);
  if (!browser) {
    console.log("未连接到 50191");
    return;
  }
  const pages = await browser.pages();
  const blblPage = pages.find(p => p.url().includes("bilibili.com"));
  if (!blblPage) {
    console.log("未找到 B 站页面");
    browser.disconnect();
    return;
  }

  const tagDomInfo = await blblPage.evaluate(() => {
    const container = document.querySelector(".tag-container");
    if (!container) return "未找到 .tag-container";
    return {
      innerHTML: container.innerHTML.slice(0, 1500),
      tagItems: Array.from(container.querySelectorAll('[class*="tag"], [class*="item"], [class*="label"]')).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent.trim(),
      })),
    };
  });

  console.log("Tag DOM:", JSON.stringify(tagDomInfo, null, 2));
  browser.disconnect();
}

main().catch(console.error);
