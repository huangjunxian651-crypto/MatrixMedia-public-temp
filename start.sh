#!/usr/bin/env bash
set -e

# 切换到项目根目录
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 补充 Node.js 常用路径兜底
export PATH="/Users/jun10r/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "================================================"
echo "    MatrixMedia 矩媒 · 一键启动前后端服务"
echo "================================================"

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未检测到 Node.js，请确保已安装 Node 20+"
  exit 1
fi

# 确保遥测配置存在
if [ ! -f "src/main/services/telemetrySecret.generated.js" ]; then
  node scripts/gen-telemetry-secret.js
fi

# 若用户指定 --dev，则启动开发模式（热更新）
if [ "$1" = "--dev" ]; then
  echo "🔥 启动开发模式（前端热更新 + 主进程调试）..."
  npm run dev
  exit 0
fi

# 检查是否需要重新编译（未编译、指定 --rebuild、或源码文件比产物新）
NEED_BUILD=0
if [ ! -f "dist/electron/main.js" ] || [ ! -f "dist/electron/index.html" ]; then
  NEED_BUILD=1
elif [ "$1" = "--rebuild" ]; then
  NEED_BUILD=1
elif [ -n "$(find src -type f -newer dist/electron/index.html 2>/dev/null)" ]; then
  echo "🔄 检测到源码（src/）已更新，自动重新编译最新产物..."
  NEED_BUILD=1
fi

if [ "$NEED_BUILD" = "1" ]; then
  echo "📦 正在编译前端与主进程产物（耗时约十多秒）..."
  npm run build:dir
fi

echo "🚀 正在启动应用..."
echo "  ► 前端界面: 正在唤起 MatrixMedia 桌面窗口"
echo "  ► 后端接口: http://127.0.0.1:30088 (内置 Express API)"
echo "================================================"

# 启动应用（载入主进程与前端界面，启动 30088 后端服务）
exec ./node_modules/.bin/electron . "$@"
