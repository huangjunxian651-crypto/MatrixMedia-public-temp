const { chromium } = require('playwright-core');

async function main() {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:53630');
    console.log('✅ Playwright 成功通过 CDP 连接到 Electron 实例！');
    const contexts = browser.contexts();
    console.log('Contexts 数量:', contexts.length);
    for (const ctx of contexts) {
      const pages = ctx.pages();
      console.log('Pages 数量:', pages.length);
      for (const p of pages) {
        console.log('Page URL:', p.url());
      }
    }
    await browser.close();
  } catch (e) {
    console.error('连接失败:', e);
  }
}

main();
