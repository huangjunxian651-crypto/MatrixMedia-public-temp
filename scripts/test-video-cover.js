"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { buildSync } = require("esbuild");

async function main() {
  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "test/.cache");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("--> 测试 1: parsePublishArgs 与 publishBodyToArgv 对 --cover 的支持");
  const parseArgsBundle = path.join(outDir, "parsePublishArgs.cjs");
  buildSync({
    entryPoints: [path.join(root, "src/main/cli/parsePublishArgs.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: parseArgsBundle,
  });
  const {
    parsePublishArgs,
    publishBodyToArgv,
    publishHelpText,
  } = require(parseArgsBundle);

  // 测试帮助文档
  const helpText = publishHelpText();
  assert.ok(helpText.includes("--cover"), "帮助文档中应包含 --cover");

  // 测试 CLI 参数解析
  const dummyVideo = path.join(__dirname, "test-video-cover.js");
  const dummyCover = path.join(__dirname, "test-video-cover.js");
  const parsed = parsePublishArgs([
    "-p", "dy",
    "--phone", "13800138000",
    "-f", dummyVideo,
    "-t", "测试标题",
    "--cover", dummyCover,
  ]);

  assert.strictEqual(parsed.ok, true, "解析应当成功");
  assert.strictEqual(parsed.value.cover, dummyCover, "cover 原始参数应匹配");
  assert.strictEqual(parsed.value.coverPath, path.resolve(dummyCover), "coverPath 绝对路径应匹配");

  // 测试 HTTP body 转 argv
  const argv = publishBodyToArgv({
    platform: "blbl",
    file: dummyVideo,
    title: "测试标题",
    phone: "13800138000",
    cover: dummyCover,
  });

  assert.ok(argv.includes("--cover"), "argv 中应包含 --cover");
  const coverIdx = argv.indexOf("--cover");
  assert.strictEqual(argv[coverIdx + 1], dummyCover, "--cover 后跟封面路径");

  console.log("--> 测试 2: 验证 platformCover 模块导出与容错逻辑");
  const platformCoverBundle = path.join(outDir, "platformCover.cjs");
  buildSync({
    entryPoints: [path.join(root, "src/main/services/upLoad/platformCover.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: platformCoverBundle,
  });
  const {
    uploadBilibiliCover,
    uploadDouyinCover,
    uploadKuaishouCover,
    uploadPlatformCover,
  } = require(platformCoverBundle);

  assert.strictEqual(typeof uploadBilibiliCover, "function");
  assert.strictEqual(typeof uploadDouyinCover, "function");
  assert.strictEqual(typeof uploadKuaishouCover, "function");
  assert.strictEqual(typeof uploadPlatformCover, "function");

  // 模拟空路径或无效路径返回 false，不抛出异常
  const resEmpty = await uploadPlatformCover("dy", {}, "");
  assert.strictEqual(resEmpty, false, "空路径应返回 false");

  const resNonExist = await uploadPlatformCover("dy", {}, "/path/not/exist.jpg");
  assert.strictEqual(resNonExist, false, "不存在的路径应返回 false");

  console.log("--> 测试 3: 验证 Playwright 脚本 exports");
  const { uploadCoverWithPlaywright } = require("./playwright-cover-uploader");
  assert.strictEqual(typeof uploadCoverWithPlaywright, "function");

  console.log("✅ 所有视频封面测试用例全部通过！");
}

main().catch((err) => {
  console.error("❌ 测试失败:", err);
  process.exit(1);
});
