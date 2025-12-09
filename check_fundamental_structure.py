"""
检查基本面功能结构
"""

import os
import sys

def check_file_exists(path, description):
    """检查文件是否存在"""
    if os.path.exists(path):
        print(f"[OK] {description}: {path}")
        return True
    else:
        print(f"[ERROR] {description}不存在: {path}")
        return False

def check_file_content(path, keyword, description):
    """检查文件内容"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        if keyword in content:
            print(f"[OK] {description}")
            return True
        else:
            print(f"[ERROR] {description}失败")
            return False
    except Exception as e:
        print(f"[ERROR] 读取文件失败: {e}")
        return False

def main():
    """主检查函数"""
    print("=" * 60)
    print("基本面功能结构检查")
    print("=" * 60)

    checks = []

    # 1. 检查基本面客户端文件
    client_path = os.path.join("data-service", "src", "analyzers", "fundamental", "fundamental_client.py")
    checks.append(("基本面客户端文件", check_file_exists(client_path, "基本面客户端文件")))

    # 2. 检查基本面分析器文件
    analyzer_path = os.path.join("data-service", "src", "analyzers", "fundamental", "fundamental_analyzer.py")
    checks.append(("基本面分析器文件", check_file_exists(analyzer_path, "基本面分析器文件")))

    # 3. 检查基本面数据库工具
    db_path = os.path.join("data-service", "src", "utils", "fundamental_db.py")
    checks.append(("基本面数据库工具", check_file_exists(db_path, "基本面数据库工具")))

    # 4. 检查API路由文件
    api_path = os.path.join("data-service", "src", "routes", "fundamental.py")
    checks.append(("基本面API路由文件", check_file_exists(api_path, "基本面API路由文件")))

    # 5. 检查数据库初始化文件是否包含基本面表
    database_path = os.path.join("data-service", "src", "utils", "database.py")
    if check_file_exists(database_path, "数据库初始化文件"):
        checks.append(("基本面表结构", check_file_content(database_path, "fundamental_scores", "基本面表结构检查")))

    # 6. 检查主应用文件
    main_path = os.path.join("data-service", "src", "main.py")
    if check_file_exists(main_path, "主应用文件"):
        # 检查导入
        checks.append(("基本面路由导入", check_file_content(main_path, "from .routes import", "基本面路由导入检查") and
                      check_file_content(main_path, "fundamental", "基本面模块检查")))
        # 检查路由注册
        checks.append(("基本面路由注册", check_file_content(main_path, "app.include_router(fundamental.router", "基本面路由注册检查")))

    # 7. 检查API路由内容
    if os.path.exists(api_path):
        with open(api_path, 'r', encoding='utf-8') as f:
            api_content = f.read()

        # 检查关键端点（注意：前缀在router级别定义）
        endpoints = [
            ("健康检查端点", "/health"),
            ("股票基本信息端点", "/stock/"),
            ("基本面分析端点", "/analysis"),
            ("高分股票端点", "top-stocks")
        ]

        for desc, endpoint in endpoints:
            if endpoint in api_content:
                print(f"[OK] {desc}: {endpoint}")
                checks.append((desc, True))
            else:
                print(f"[ERROR] {desc}缺失: {endpoint}")
                checks.append((desc, False))

    # 输出检查结果
    print("\n" + "=" * 60)
    print("检查结果汇总:")
    print("=" * 60)

    passed = 0
    total = len(checks)

    for desc, result in checks:
        status = "OK" if result else "ERROR"
        print(f"{desc:25} [{status}]")
        if result:
            passed += 1

    print("=" * 60)
    print(f"总计: {passed}/{total} 项检查通过")

    if passed == total:
        print("\n[SUCCESS] 基本面功能结构完整！")
        print("\n下一步操作:")
        print("1. 启动数据服务: cd data-service && python -m uvicorn src.main:app --reload --port 8001")
        print("2. 访问API文档: http://localhost:8001/docs")
        print("3. 测试基本面API: http://localhost:8001/api/fundamental/health")
    else:
        print(f"\n[WARNING] 有 {total - passed} 项检查失败")

    print("=" * 60)

if __name__ == "__main__":
    main()