"use strict";

const http = require("http");

const payload = JSON.stringify({
  platform: "ks",
  phone: "ai音乐",
  partition: "persist:ai音乐快手",
  file: "/Users/jun10r/Desktop/RPReplay_Final1788521456.mp4",
  cover: "/Users/jun10r/Pictures/142.JPG",
  coverPath: "/Users/jun10r/Pictures/142.JPG",
  title: "测试快手封面上传",
  description: "测试快手封面上传",
  draft: true,
  show: true,
  closeWindowAfterPublish: false,
});

console.log("🚀 发起快手草稿与封面上传测试...");

const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 30088,
    path: "/publish",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log("测试响应:", data);
    });
  }
);

req.on("error", (e) => {
  console.error("请求失败:", e);
});

req.write(payload);
req.end();
