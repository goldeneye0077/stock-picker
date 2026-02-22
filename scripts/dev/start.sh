#!/bin/bash

# ========================================
# 智能选股系统 - Linux/macOS 快速启动脚本
# ========================================

echo ""
echo "========================================"
echo "智能选股系统 - 服务启动"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查 Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[错误] 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

echo "[信息] 正在启动服务..."
echo ""

# 使用 Node.js 启动脚本
node start-services.js
