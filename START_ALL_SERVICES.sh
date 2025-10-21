#!/bin/bash

# 智能选股系统 - 一键启动所有服务
# 使用方法: chmod +x START_ALL_SERVICES.sh && ./START_ALL_SERVICES.sh

echo "======================================"
echo "  智能选股系统 - 服务启动脚本"
echo "======================================"

# 检查依赖
check_dependencies() {
    echo "检查依赖工具..."

    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装，请先安装 Node.js (https://nodejs.org/)"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        echo "❌ npm 未安装"
        exit 1
    fi

    if ! command -v python3 &> /dev/null; then
        echo "❌ Python3 未安装，请先安装 Python3"
        exit 1
    fi

    echo "✅ 依赖检查通过"
}

# 创建数据目录
setup_directories() {
    echo "创建必要目录..."
    mkdir -p data
    echo "✅ 数据目录创建完成"
}

# 安装依赖
install_dependencies() {
    echo ""
    echo "======================================"
    echo "  安装项目依赖 (首次运行需要等待)"
    echo "======================================"

    # 检查是否已安装
    if [ ! -d "node_modules" ]; then
        echo "安装根目录依赖..."
        npm install
    fi

    if [ ! -d "backend/node_modules" ]; then
        echo "安装后端依赖..."
        cd backend && npm install && cd ..
    fi

    if [ ! -d "frontend/node_modules" ]; then
        echo "安装前端依赖..."
        cd frontend && npm install && cd ..
    fi

    echo "安装数据服务依赖..."
    pip3 install -r data-service/requirements.txt --quiet

    echo "✅ 所有依赖安装完成"
}

# 配置环境变量
setup_env() {
    echo ""
    echo "======================================"
    echo "  配置环境变量"
    echo "======================================"

    if [ ! -f "backend/.env" ]; then
        cp backend/.env.example backend/.env
        echo "✅ 后端 .env 文件已创建"
    fi

    if [ ! -f "data-service/.env" ]; then
        cat > data-service/.env << 'EOF'
# Tushare API Token (可选 - 如果需要下载数据才配置)
# TUSHARE_TOKEN=your_token_here

# 数据库路径
DATABASE_PATH=../data/stock_picker.db
EOF
        echo "✅ 数据服务 .env 文件已创建"
    fi
}

# 启动服务
start_services() {
    echo ""
    echo "======================================"
    echo "  启动所有服务"
    echo "======================================"

    # 使用 trap 捕获退出信号，确保所有子进程被清理
    trap 'echo ""; echo "正在停止所有服务..."; kill $(jobs -p) 2>/dev/null; exit' INT TERM

    # 启动后端服务
    echo "启动后端服务 (端口 3000)..."
    cd backend
    npm run dev > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    cd ..
    sleep 2

    # 启动数据服务
    echo "启动数据服务 (端口 8001)..."
    cd data-service
    python3 -m uvicorn src.main:app --reload --port 8001 --host 0.0.0.0 > ../logs/data-service.log 2>&1 &
    DATA_SERVICE_PID=$!
    cd ..
    sleep 3

    # 启动前端服务
    echo "启动前端服务 (端口 3001)..."
    cd frontend
    npm run dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..
    sleep 3

    echo ""
    echo "======================================"
    echo "  ✅ 所有服务启动成功！"
    echo "======================================"
    echo ""
    echo "📌 服务访问地址："
    echo "   前端界面:  http://localhost:3001"
    echo "   后端API:   http://localhost:3000"
    echo "   数据服务:  http://localhost:8001"
    echo "   API文档:   http://localhost:8001/docs"
    echo ""
    echo "📝 日志文件："
    echo "   后端日志:     logs/backend.log"
    echo "   数据服务日志: logs/data-service.log"
    echo "   前端日志:     logs/frontend.log"
    echo ""
    echo "💡 提示："
    echo "   - 按 Ctrl+C 停止所有服务"
    echo "   - 数据库位置: data/stock_picker.db"
    echo "   - 如需下载数据: python create_sample_data.py"
    echo ""
    echo "⏳ 服务运行中，请勿关闭此窗口..."
    echo ""

    # 等待用户中断
    wait
}

# 主流程
main() {
    # 创建日志目录
    mkdir -p logs

    check_dependencies
    setup_directories
    install_dependencies
    setup_env
    start_services
}

# 运行主流程
main
