"""
简单基本面功能测试
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "data-service", "src"))

async def test_database_initialization():
    """测试数据库初始化"""
    print("测试数据库初始化...")

    try:
        from utils.database import init_database
        await init_database()
        print("OK 数据库初始化成功")
        return True
    except Exception as e:
        print(f"ERROR 数据库初始化失败: {e}")
        return False

async def test_fundamental_db():
    """测试基本面数据库"""
    print("\n测试基本面数据库...")

    try:
        from utils.fundamental_db import FundamentalDB
        db = FundamentalDB()
        print("OK 基本面数据库类创建成功")

        # 测试连接
        conn = await db.get_connection()
        await conn.close()
        print("OK 数据库连接成功")

        return True
    except Exception as e:
        print(f"ERROR 基本面数据库测试失败: {e}")
        return False

async def test_fundamental_client_structure():
    """测试基本面客户端结构"""
    print("\n测试基本面客户端结构...")

    try:
        # 检查文件是否存在
        client_path = os.path.join("data-service", "src", "analyzers", "fundamental", "fundamental_client.py")
        analyzer_path = os.path.join("data-service", "src", "analyzers", "fundamental", "fundamental_analyzer.py")

        if os.path.exists(client_path):
            print(f"OK 基本面客户端文件存在: {client_path}")
        else:
            print(f"ERROR 基本面客户端文件不存在: {client_path}")
            return False

        if os.path.exists(analyzer_path):
            print(f"OK 基本面分析器文件存在: {analyzer_path}")
        else:
            print(f"ERROR 基本面分析器文件不存在: {analyzer_path}")
            return False

        # 尝试导入类（不实例化）
        from analyzers.fundamental.fundamental_client import FundamentalClient
        from analyzers.fundamental.fundamental_analyzer import FundamentalAnalyzer

        print("OK 基本面类导入成功")
        return True

    except Exception as e:
        print(f"ERROR 基本面客户端结构测试失败: {e}")
        return False

async def test_api_routes():
    """测试API路由"""
    print("\n测试API路由...")

    try:
        api_path = os.path.join("data-service", "src", "routes", "fundamental.py")

        if os.path.exists(api_path):
            print(f"OK 基本面API路由文件存在: {api_path}")

            # 检查文件内容
            with open(api_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 检查关键路由
            routes_to_check = [
                "/api/fundamental/health",
                "/api/fundamental/stock/",
                "/api/fundamental/top-stocks",
                "/api/fundamental/analysis"
            ]

            missing_routes = []
            for route in routes_to_check:
                if route in content:
                    print(f"  OK 路由包含: {route}")
                else:
                    print(f"  ERROR 路由缺失: {route}")
                    missing_routes.append(route)

            if not missing_routes:
                print("OK 所有关键路由都存在")
                return True
            else:
                print(f"ERROR 缺失路由: {missing_routes}")
                return False
        else:
            print(f"ERROR API路由文件不存在: {api_path}")
            return False

    except Exception as e:
        print(f"ERROR API路由测试失败: {e}")
        return False

async def test_main_app_integration():
    """测试主应用集成"""
    print("\n测试主应用集成...")

    try:
        main_path = os.path.join("data-service", "src", "main.py")

        if os.path.exists(main_path):
            print(f"OK 主应用文件存在: {main_path}")

            with open(main_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 检查导入
            if "from .routes import" in content and "fundamental" in content:
                print("OK 基本面路由已导入")
            else:
                print("ERROR 基本面路由未导入")
                return False

            # 检查路由注册
            if "app.include_router(fundamental.router" in content:
                print("OK 基本面路由已注册")
                return True
            else:
                print("ERROR 基本面路由未注册")
                return False
        else:
            print(f"ERROR 主应用文件不存在: {main_path}")
            return False

    except Exception as e:
        print(f"ERROR 主应用集成测试失败: {e}")
        return False

async def main():
    """主测试函数"""
    print("=" * 60)
    print("基本面功能集成测试")
    print("=" * 60)

    test_results = {}

    # 运行测试
    test_results['database_init'] = await test_database_initialization()
    test_results['fundamental_db'] = await test_fundamental_db()
    test_results['client_structure'] = await test_fundamental_client_structure()
    test_results['api_routes'] = await test_api_routes()
    test_results['app_integration'] = await test_main_app_integration()

    # 输出测试结果
    print("\n" + "=" * 60)
    print("测试结果汇总:")
    print("=" * 60)

    for test_name, result in test_results.items():
        status = "OK 通过" if result else "ERROR 失败"
        print(f"{test_name:25} {status}")

    total_tests = len(test_results)
    passed_tests = sum(1 for result in test_results.values() if result)

    print("=" * 60)
    print(f"总计: {passed_tests}/{total_tests} 项测试通过")

    if passed_tests == total_tests:
        print("\nSUCCESS 所有测试通过！基本面功能集成完成。")
        print("\n下一步:")
        print("1. 启动数据服务: cd data-service && python -m uvicorn src.main:app --reload --port 8001")
        print("2. 访问API文档: http://localhost:8001/docs")
        print("3. 测试API端点: http://localhost:8001/api/fundamental/health")
    else:
        print(f"\nWARNING 有 {total_tests - passed_tests} 项测试失败，请检查相关功能。")

    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())