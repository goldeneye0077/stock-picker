"""自动测试脚本"""
import sys
import os

# 模拟用户输入
class MockInput:
    def __init__(self, responses):
        self.responses = iter(responses)

    def __call__(self, prompt=''):
        print(prompt, end='')
        response = next(self.responses)
        print(response)
        return response

# 设置测试参数
test_image = r"E:\stock_an\stock-picker\mouse.png"
test_responses = [
    test_image,          # 图片路径
    'n',                 # 是否开启调试模式
    'n',                 # 是否登录
    '',                  # 准备好后按回车
    '',                  # 最后按回车关闭浏览器
]

# 替换 input 函数
original_input = __builtins__.input
__builtins__.input = MockInput(test_responses)

try:
    # 导入并运行主脚本
    exec(open('1688_scraper_enhanced.py', encoding='utf-8').read())
except Exception as e:
    print(f"\n执行出错: {e}")
    import traceback
    traceback.print_exc()
finally:
    __builtins__.input = original_input