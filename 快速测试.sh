#!/bin/bash

echo "======================================"
echo "  快速测试访问地址"
echo "======================================"
echo ""

# 获取服务器IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo "📍 服务器信息："
echo "   内网IP: $SERVER_IP"
echo ""

echo "🔍 测试服务状态..."
echo ""

# 测试后端
echo "1️⃣ 测试后端 API (端口 3000):"
curl -s http://localhost:3000/health && echo "   ✅ 后端运行正常" || echo "   ❌ 后端无法访问"
echo ""

# 测试数据服务
echo "2️⃣ 测试数据服务 (端口 8001):"
curl -s http://localhost:8001/health && echo "   ✅ 数据服务运行正常" || echo "   ❌ 数据服务无法访问"
echo ""

# 测试前端
echo "3️⃣ 测试前端服务 (端口 3001):"
curl -s http://localhost:3001 > /dev/null && echo "   ✅ 前端运行正常" || echo "   ❌ 前端无法访问"
echo ""

echo "======================================"
echo "  📱 平板访问地址"
echo "======================================"
echo ""
echo "请在平板浏览器中尝试以下地址："
echo ""
echo "🌐 前端页面:"
echo "   http://$SERVER_IP:3001"
echo ""
echo "🔧 后端API:"
echo "   http://$SERVER_IP:3000"
echo ""
echo "📊 数据服务:"
echo "   http://$SERVER_IP:8001"
echo ""
echo "======================================"
echo ""
echo "💡 提示："
echo "   如果上述地址无法访问，请查看 Claude Code"
echo "   界面的 '端口' 或  'Ports' 选项卡获取公网地址"
echo ""
