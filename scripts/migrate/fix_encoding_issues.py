#!/usr/bin/env python3
"""
修复脚本中的编码问题
移除所有Unicode符号，替换为纯文本
"""

import os
import re

def fix_file_encoding(filepath):
    """修复单个文件的编码问题"""
    print(f"处理文件: {filepath}")

    if not os.path.exists(filepath):
        print(f"  文件不存在: {filepath}")
        return False

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Unicode符号替换映射
        unicode_replacements = {
            '✓': 'OK',
            '✗': 'x',
            '✅': 'OK',
            '❌': 'x',
            '•': '-',
            '→': '->',
            '←': '<-',
            '↑': '^',
            '↓': 'v',
            '↔': '<->',
            '↕': 'v^',
            '↖': '^<',
            '↗': '^>',
            '↘': 'v>',
            '↙': 'v<',
            '↩': '<-',
            '↪': '->',
            '↶': '<-',
            '↷': '->',
            '↺': 'o',
            '↻': 'o',
            '↼': '<-',
            '↽': '<-',
            '↾': '^',
            '↿': '^',
            '⇀': '->',
            '⇁': '->',
            '⇂': 'v',
            '⇃': 'v',
            '⇄': '<->',
            '⇅': 'v^',
            '⇆': '<->',
            '⇇': '<-',
            '⇈': '^',
            '⇉': '->',
            '⇊': 'v',
            '⇋': '<->',
            '⇌': '<->',
            '⇍': '<-',
            '⇎': '!=',
            '⇏': '!->',
            '⇐': '<=',
            '⇑': '^',
            '⇒': '=>',
            '⇓': 'v',
            '⇔': '<=>',
            '⇕': 'v^',
            '⇖': '^<',
            '⇗': '^>',
            '⇘': 'v>',
            '⇙': 'v<',
            '⇚': '<=',
            '⇛': '=>',
            '⇜': '<-',
            '⇝': '->',
            '⇞': '^',
            '⇟': 'v',
            '⇠': '<-',
            '⇡': '^',
            '⇢': '->',
            '⇣': 'v',
            '⇤': '<-',
            '⇥': '->',
            '⇦': '<-',
            '⇧': '^',
            '⇨': '->',
            '⇩': 'v',
            '⇪': '^',
            '⇫': 'v',
            '⇬': '^',
            '⇭': 'v',
            '⇮': '^',
            '⇯': 'v',
            '⇰': '->',
            '⇱': '<-',
            '⇲': '->',
            '⇳': 'v^',
            '⇴': '->',
            '⇵': 'v^',
            '⇶': '->',
            '⇷': '<-',
            '⇸': '->',
            '⇹': '<->',
            '⇺': '<-',
            '⇻': '->',
            '⇼': '=',
            '⇽': '<-',
            '⇾': '->',
            '⇿': '<->'
        }

        modified = False
        for unicode_char, replacement in unicode_replacements.items():
            if unicode_char in content:
                count = content.count(unicode_char)
                content = content.replace(unicode_char, replacement)
                print(f"  替换 {unicode_char} -> {replacement} ({count}次)")
                modified = True

        if modified:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  文件已修复")
        else:
            print(f"  无需修复")

        return modified

    except Exception as e:
        print(f"  处理文件时出错: {e}")
        return False

def main():
    """主函数"""
    print("修复脚本编码问题")
    print("=" * 60)

    files_to_fix = [
        "download_7days_all_stocks.py",
        "check_data_quality.py",
        "verify_hot_sector_fix.py",
        "collect_hot_sector_data.py",
        "optimize_data_collection.py",
        "test_script_api.py",
        "integration_test.py"
    ]

    fixed_count = 0
    for filename in files_to_fix:
        if fix_file_encoding(filename):
            fixed_count += 1
        print()

    print("=" * 60)
    print(f"修复完成: {fixed_count}/{len(files_to_fix)} 个文件已修复")

    # 测试修复后的脚本
    print("\n测试修复后的脚本...")
    try:
        import subprocess
        import sys

        print("测试 download_7days_all_stocks.py...")
        result = subprocess.run(
            [sys.executable, "download_7days_all_stocks.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            timeout=30
        )

        if result.returncode == 0:
            print("  脚本执行成功")
            # 检查输出中是否有Unicode错误
            if "codec can't encode" in result.stdout or "codec can't encode" in result.stderr:
                print("  警告: 输出中仍有编码问题")
            else:
                print("  输出无编码问题")
        else:
            print(f"  脚本执行失败 (错误码: {result.returncode})")
            print(f"  错误信息: {result.stderr[:200]}")

    except subprocess.TimeoutExpired:
        print("  脚本执行超时（正常，数据采集需要时间）")
    except Exception as e:
        print(f"  测试时出错: {e}")

if __name__ == "__main__":
    main()