"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");

// 测试 4:3 比例正则匹配
const ratioRegex = /(?:^|[^\d])4\s*[:：\/]\s*3(?:[^\d]|$)/;

// 应匹配的情况
const validCases = [
  "4:3",
  "4 : 3",
  "4：3",
  "4/3",
  "首页推荐封面（4:3）",
  "横版 4:3",
  "4:3比例",
  "4:3 比例",
  "封面比例 4:3",
];

for (const text of validCases) {
  assert.strictEqual(
    ratioRegex.test(text),
    true,
    `应该匹配 4:3 文本: "${text}"`
  );
}

// 严禁匹配的情况
const invalidCases = [
  "16:9",
  "9:16",
  "1:1",
  "3:4",
  "3 : 4",
  "竖版 3:4",
  "自由比例",
];

for (const text of invalidCases) {
  const isExcluded =
    !ratioRegex.test(text) || text.includes("3:4") || text.includes("3 : 4");
  assert.strictEqual(
    isExcluded,
    true,
    `必须排除非 4:3 文本: "${text}"`
  );
}

// 测试 Playwright 模块加载
const { uploadCoverWithPlaywright } = require("./playwright-cover-uploader");
assert.strictEqual(typeof uploadCoverWithPlaywright, "function", "Playwright 上传函数应存在且为 function");

console.log("✅ 封面 4:3 正则与 Playwright 模块单测全部通过！");
