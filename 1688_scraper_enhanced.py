import os
import sys
import time
import json
import subprocess
import winreg
import random
from pathlib import Path
from contextlib import contextmanager

# 修复 Windows 命令行编码问题
if sys.platform == 'win32':
    try:
        # 设置标准输出为 UTF-8
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        # Python 3.6 及以下版本的兼容处理
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# ============================================================
# 代理管理模块
# ============================================================

class ProxyManager:
    """Windows 系统代理管理器"""

    def __init__(self):
        self.registry_path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
        self.original_proxy_state = None
        self.original_proxy_server = None

    def get_proxy_status(self):
        """获取当前代理状态"""
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.registry_path, 0, winreg.KEY_READ)
            try:
                proxy_enable, _ = winreg.QueryValueEx(key, "ProxyEnable")
                proxy_server, _ = winreg.QueryValueEx(key, "ProxyServer")
                winreg.CloseKey(key)
                return bool(proxy_enable), proxy_server
            except FileNotFoundError:
                winreg.CloseKey(key)
                return False, ""
        except Exception as e:
            print(f"⚠️  无法读取代理设置: {e}")
            return None, None

    def disable_proxy(self):
        """禁用系统代理"""
        try:
            self.original_proxy_state, self.original_proxy_server = self.get_proxy_status()
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.registry_path, 0, winreg.KEY_WRITE)
            winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
            winreg.CloseKey(key)
            self._refresh_internet_settings()
            print("✅ 已禁用系统代理")
            return True
        except Exception as e:
            print(f"❌ 禁用代理失败: {e}")
            return False

    def restore_proxy(self):
        """恢复原始代理设置"""
        if self.original_proxy_state is None:
            return
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.registry_path, 0, winreg.KEY_WRITE)
            winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, int(self.original_proxy_state))
            if self.original_proxy_server:
                winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, self.original_proxy_server)
            winreg.CloseKey(key)
            self._refresh_internet_settings()
            print("✅ 已恢复原始代理设置")
        except Exception as e:
            print(f"⚠️  恢复代理设置失败: {e}")

    def _refresh_internet_settings(self):
        """刷新 Internet 设置"""
        try:
            import ctypes
            INTERNET_OPTION_SETTINGS_CHANGED = 39
            INTERNET_OPTION_REFRESH = 37
            internet_set_option = ctypes.windll.Wininet.InternetSetOptionW
            internet_set_option(0, INTERNET_OPTION_SETTINGS_CHANGED, 0, 0)
            internet_set_option(0, INTERNET_OPTION_REFRESH, 0, 0)
        except:
            pass

@contextmanager
def no_proxy_context():
    """代理上下文管理器"""
    proxy_manager = ProxyManager()
    enabled, server = proxy_manager.get_proxy_status()

    if enabled:
        print(f"⚠️  检测到系统代理: {server}")
        print("🔧 自动禁用代理中...")
        proxy_manager.disable_proxy()
        time.sleep(1)
    else:
        print("✅ 系统未启用代理")

    proxy_vars = [
        'HTTP_PROXY', 'HTTPS_PROXY', 'FTP_PROXY', 'ALL_PROXY',
        'http_proxy', 'https_proxy', 'ftp_proxy', 'all_proxy',
        'NO_PROXY', 'no_proxy'
    ]
    original_env = {}
    for var in proxy_vars:
        original_env[var] = os.environ.pop(var, None)

    try:
        yield proxy_manager
    finally:
        for var, value in original_env.items():
            if value is not None:
                os.environ[var] = value
        if enabled:
            print("\n🔧 恢复原始代理设置...")
            proxy_manager.restore_proxy()


# ============================================================
# 人类行为模拟模块（新增）
# ============================================================

class HumanBehavior:
    """人类行为模拟器"""

    @staticmethod
    def random_sleep(min_sec=0.5, max_sec=2.0):
        """随机延时（模拟人类思考时间）"""
        time.sleep(random.uniform(min_sec, max_sec))

    @staticmethod
    def simulate_mouse_move(driver):
        """模拟鼠标移动轨迹"""
        try:
            from selenium.webdriver.common.action_chains import ActionChains

            # 随机移动到页面上的某个位置
            x_offset = random.randint(100, 800)
            y_offset = random.randint(100, 600)

            actions = ActionChains(driver)
            actions.move_by_offset(x_offset, y_offset).perform()

            # 重置鼠标位置
            actions.move_by_offset(-x_offset, -y_offset).perform()
        except:
            pass

    @staticmethod
    def natural_scroll(driver, scroll_times=None):
        """模拟自然滚动（随机速度和停顿）"""
        if scroll_times is None:
            scroll_times = random.randint(5, 12)

        for i in range(scroll_times):
            # 随机滚动距离
            scroll_distance = random.randint(300, 800)
            driver.execute_script(f"window.scrollBy(0, {scroll_distance});")

            # 随机停顿时间（0.8-2.5秒）
            HumanBehavior.random_sleep(0.8, 2.5)

            # 偶尔向上滚动一点（模拟查看内容）
            if random.random() < 0.3:
                back_distance = random.randint(50, 200)
                driver.execute_script(f"window.scrollBy(0, -{back_distance});")
                HumanBehavior.random_sleep(0.5, 1.0)

        # 滚回顶部
        driver.execute_script("window.scrollTo({top: 0, behavior: 'smooth'});")
        HumanBehavior.random_sleep(1.5, 2.5)


# ============================================================
# 导入依赖
# ============================================================

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException
    from selenium.webdriver.common.keys import Keys
    import pandas as pd
    from datetime import datetime
except ImportError as e:
    print(f"❌ 缺少依赖库: {e}")
    print("请运行: pip install selenium pandas openpyxl")
    sys.exit(1)


# ============================================================
# 1688 爬虫主类（增强版反爬）
# ============================================================

class Alibaba1688Scraper:
    """1688 以图搜图商品采集器（增强反爬版本）"""

    def __init__(self, headless=False, use_profile=True, debug=False):
        """
        初始化浏览器驱动
        :param headless: 是否无头模式
        :param use_profile: 是否使用用户数据目录（保持登录状态）
        :param debug: 是否开启调试模式
        """
        self.debug = debug
        print("🚀 正在启动 Chrome 浏览器（增强反爬版本）...")

        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless')

        # ===== 用户数据目录 =====
        if use_profile:
            profile_dir = os.path.join(os.getcwd(), "chrome_profile_1688")
            if not os.path.exists(profile_dir):
                os.makedirs(profile_dir)
                print(f"✅ 创建用户数据目录: {profile_dir}")
            else:
                print(f"✅ 使用已有用户数据目录（保留登录状态）")

            options.add_argument(f'--user-data-dir={profile_dir}')
            options.add_argument('--profile-directory=Default')

        # ===== 增强版反反爬核心配置 =====
        options.add_experimental_option('excludeSwitches', ['enable-automation', 'enable-logging'])
        options.add_experimental_option('useAutomationExtension', False)
        options.add_argument('--disable-blink-features=AutomationControlled')

        # 更真实的 User-Agent（使用最新版本）
        ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        options.add_argument(f'--user-agent={ua}')

        # ===== 禁用代理 =====
        options.add_argument('--no-proxy-server')
        options.add_argument('--proxy-server=direct://')
        options.add_argument('--proxy-bypass-list=*')

        # ===== 增强稳定性和反检测 =====
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--ignore-certificate-errors')
        options.add_argument('--disable-software-rasterizer')
        options.add_argument('--disable-extensions')
        options.add_argument('--log-level=3')
        options.add_argument('--disable-infobars')
        options.add_argument('--start-maximized')  # 最大化窗口，更像真人
        options.add_argument('--disable-web-security')
        options.add_argument('--allow-running-insecure-content')

        # ===== Prefs 配置（增强版）=====
        prefs = {
            'proxy': {'mode': 'direct'},
            'credentials_enable_service': False,
            'profile.password_manager_enabled': False,
            'profile.default_content_setting_values.notifications': 2,
            'profile.managed_default_content_settings.images': 1,  # 启用图片加载
            'permissions.default.stylesheet': 1,  # 启用CSS
            'permissions.default.javascript': 1,  # 启用JS
        }
        options.add_experimental_option('prefs', prefs)

        try:
            self.driver = webdriver.Chrome(options=options)

            # ===== 注入增强版反检测脚本 =====
            stealth_js = '''
                // 核心：隐藏 webdriver 属性
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });

                // 伪造 navigator 属性
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });

                Object.defineProperty(navigator, 'languages', {
                    get: () => ['zh-CN', 'zh', 'en-US', 'en']
                });

                Object.defineProperty(navigator, 'platform', {
                    get: () => 'Win32'
                });

                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => 8
                });

                Object.defineProperty(navigator, 'deviceMemory', {
                    get: () => 8
                });

                // 伪造 Chrome 对象
                window.chrome = {
                    runtime: {},
                    loadTimes: function() {},
                    csi: function() {},
                    app: {}
                };

                // 伪造权限查询
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );

                // Canvas 指纹混淆
                const getImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function() {
                    const imageData = getImageData.apply(this, arguments);
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        imageData.data[i] += Math.floor(Math.random() * 3) - 1;
                        imageData.data[i + 1] += Math.floor(Math.random() * 3) - 1;
                        imageData.data[i + 2] += Math.floor(Math.random() * 3) - 1;
                    }
                    return imageData;
                };

                // WebGL 指纹混淆
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) {
                        return 'Intel Inc.';
                    }
                    if (parameter === 37446) {
                        return 'Intel Iris OpenGL Engine';
                    }
                    return getParameter.call(this, parameter);
                };

                // 修改 Date 时间精度（防止时间戳检测）
                const originalDate = Date;
                Date = class extends originalDate {
                    constructor() {
                        super();
                        this.setMilliseconds(Math.floor(this.getMilliseconds() / 10) * 10);
                    }
                };

                // 修改 console.debug（某些网站会检测）
                console.debug = () => {};
            '''

            self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': stealth_js})

            self.driver.set_page_load_timeout(30)
            self.wait = WebDriverWait(self.driver, 20)
            self.driver_closed = False

            # 设置窗口大小为常见分辨率
            self.driver.set_window_size(1920, 1080)

            print("✅ 浏览器启动成功（已注入反检测脚本）\n")

        except Exception as e:
            print(f"❌ 浏览器启动失败: {e}")
            raise

    def check_login_status(self):
        """检查登录状态"""
        try:
            print("🔍 检查登录状态...")
            self.driver.get("https://www.1688.com")
            HumanBehavior.random_sleep(2, 3)

            try:
                user_elements = self.driver.find_elements(By.CSS_SELECTOR,
                    ".site-nav-user, .login-info, [class*='userName'], [class*='user-name']")

                if user_elements:
                    for elem in user_elements:
                        if elem.is_displayed() and elem.text.strip():
                            print(f"✅ 已登录，用户信息: {elem.text.strip()[:20]}")
                            return True

                login_btns = self.driver.find_elements(By.XPATH,
                    "//*[contains(text(), '登录') or contains(text(), '免费注册')]")

                if login_btns:
                    print("⚠️  未登录")
                    return False

                print("✅ 可能已登录（未找到明确的登录按钮）")
                return True

            except:
                return False

        except Exception as e:
            print(f"⚠️  检查登录状态失败: {e}")
            return False

    def manual_login(self):
        """手动登录引导"""
        print("\n" + "=" * 70)
        print("📱 请在浏览器中完成登录")
        print("=" * 70)
        print("1. 浏览器会自动打开 1688 登录页面")
        print("2. 扫描二维码 或 输入账号密码登录")
        print("3. 登录成功后，回到命令行按回车继续")
        print("4. 下次运行脚本时会自动保持登录状态")
        print("=" * 70 + "\n")

        self.driver.get("https://login.1688.com/member/signin.htm")
        HumanBehavior.random_sleep(2, 3)

        input("登录完成后按回车继续...")

        if self.check_login_status():
            print("✅ 登录成功！\n")
            return True
        else:
            print("⚠️  登录可能未成功，但继续执行...\n")
            return False

    def search_by_image(self, image_path, retry_count=3):
        """
        通过图片搜索商品（增加重试机制）
        :param image_path: 图片路径
        :param retry_count: 重试次数
        """
        print(f"📷 开始以图搜图: {image_path}")

        for attempt in range(retry_count):
            try:
                if attempt > 0:
                    print(f"🔄 第 {attempt + 1} 次尝试...")
                    HumanBehavior.random_sleep(3, 5)

                print("🔄 正在进入以图搜图页面...")
                self.driver.get("https://s.1688.com/youyuan/index.htm?tab=imageSearch")
                HumanBehavior.random_sleep(3, 5)

                # 模拟人类行为：随机移动鼠标
                HumanBehavior.simulate_mouse_move(self.driver)
                HumanBehavior.random_sleep(1, 2)

                print("🔍 正在查找上传按钮...")
                upload_input = None

                try:
                    upload_input = self.wait.until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='file']"))
                    )
                except:
                    try:
                        upload_input = self.driver.find_element(By.XPATH, "//input[@type='file']")
                    except:
                        pass

                if not upload_input:
                    if attempt < retry_count - 1:
                        print(f"❌ 未找到上传按钮，准备重试...")
                        continue
                    else:
                        print("❌ 未找到上传按钮，请手动上传...")
                        input("手动上传完成后按回车继续...")
                        return self.driver.current_url

                abs_path = str(Path(image_path).absolute())
                print(f"📤 正在上传图片: {abs_path}")

                # 模拟真实操作：先hover再上传
                HumanBehavior.random_sleep(0.5, 1.0)
                upload_input.send_keys(abs_path)

                print("⏳ 等待搜索结果...")
                max_wait = 20
                start_time = time.time()

                while time.time() - start_time < max_wait:
                    current_url = self.driver.current_url

                    if 'simage' in current_url or 'imageSearch' not in current_url:
                        print(f"✅ 搜索完成！")
                        HumanBehavior.random_sleep(2, 3)
                        break

                    try:
                        items = self.driver.find_elements(By.CSS_SELECTOR, ".sm-offer-item, .organic-list-item")
                        if len(items) > 0:
                            print(f"✅ 检测到 {len(items)} 个商品")
                            break
                    except:
                        pass

                    HumanBehavior.random_sleep(0.8, 1.2)

                final_url = self.driver.current_url
                print(f"\n📊 当前页面：")
                print(f"   URL: {final_url}")

                try:
                    items = self.driver.find_elements(By.CSS_SELECTOR, ".sm-offer-item, .organic-list-item, .list-item")
                    print(f"   商品数量: {len(items)}")
                except:
                    print(f"   商品数量: 0")

                return final_url

            except TimeoutException:
                print(f"❌ 操作超时（第 {attempt + 1} 次尝试）")
                if attempt < retry_count - 1:
                    continue
                return None
            except Exception as e:
                print(f"❌ 搜索过程出错（第 {attempt + 1} 次尝试）: {e}")
                if attempt < retry_count - 1:
                    continue
                import traceback
                traceback.print_exc()
                return None

        return None

    def parse_transaction_amount(self, text):
        """解析成交金额"""
        import re

        if not text:
            return 0.0

        text = text.replace('成交', '').replace('+', '').replace('元', '').replace('¥', '').strip()

        if '万' in text:
            number = re.findall(r'\d+\.?\d*', text.replace('万', ''))
            if number:
                return float(number[0]) * 10000
        elif '千' in text:
            number = re.findall(r'\d+\.?\d*', text.replace('千', ''))
            if number:
                return float(number[0]) * 1000
        else:
            numbers = re.findall(r'\d+\.?\d*', text)
            if numbers:
                return float(numbers[0])

        return 0.0

    def has_valid_sales(self, sales, transaction_amount):
        """判断是否有有效销量"""
        return sales >= 2 or transaction_amount > 1.0

    def wait_for_products_load(self):
        """等待商品列表完全加载（增强版：模拟真实浏览行为）"""
        print("\n⏳ 等待商品列表加载...")

        # 模拟真实用户浏览行为
        print("📜 模拟自然浏览行为，加载更多商品...")
        HumanBehavior.natural_scroll(self.driver, scroll_times=random.randint(8, 15))

        print("✅ 页面加载完成\n")

    def extract_products(self, max_results=30):
        """提取商品信息"""
        print(f"🔍 开始提取商品（销量≥2 或 成交金额>1元，最多{max_results}条）...\n")

        # 等待页面完全加载
        self.wait_for_products_load()

        products = []

        try:
            item_selectors = [
                ".sm-offer",
                ".sm-offer-item",
                ".organic-list-item",
                ".list-item",
                ".offer-item",
                ".item",
                "[data-spm='offer']",
                ".J-offer-item",
                "[class*='offer']",
                "[class*='item']"
            ]

            items = []
            used_selector = None

            for selector in item_selectors:
                try:
                    found_items = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    if len(found_items) > len(items):
                        items = found_items
                        used_selector = selector
                        if self.debug:
                            print(f"   尝试选择器 '{selector}': 找到 {len(found_items)} 个")
                except Exception as e:
                    if self.debug:
                        print(f"   选择器 '{selector}' 失败: {e}")
                    continue

            if not items:
                print("❌ 未找到商品列表")
                print("\n💡 调试建议：")
                print("   1. 检查是否需要手动滚动页面")
                print("   2. 查看浏览器控制台是否有错误")
                print("   3. 尝试手动刷新页面")

                try:
                    screenshot_path = f"debug_screenshot_{int(time.time())}.png"
                    self.driver.save_screenshot(screenshot_path)
                    print(f"   已保存调试截图: {screenshot_path}")
                except:
                    pass

                return []

            print(f"✅ 使用选择器 '{used_selector}' 找到 {len(items)} 个商品元素\n")

            valid_count = 0
            for idx, item in enumerate(items, 1):
                try:
                    product = self._parse_product_item(item, idx)

                    if not product:
                        if self.debug:
                            print(f"  🔍 [{idx}] 未能解析出商品信息")
                        continue

                    if self.debug:
                        print(f"  🔍 [{idx}] 调试信息:")
                        print(f"      标题: {product['title'][:30]}...")
                        print(f"      价格: {product['price']}")
                        print(f"      销量: {product['sales']}")
                        print(f"      成交文本: {product['transaction_text']}")
                        print(f"      成交金额: {product['transaction_amount']}")

                    if product['price'] > 0:
                        if self.has_valid_sales(product['sales'], product['transaction_amount']):
                            products.append(product)
                            valid_count += 1

                            if product['transaction_amount'] >= 10000:
                                trans_display = f"{product['transaction_amount']/10000:.1f}万元"
                            elif product['transaction_amount'] > 0:
                                trans_display = f"{product['transaction_amount']:.0f}元"
                            else:
                                trans_display = "0元"

                            print(f"  ✓ [{valid_count}] {product['title'][:40]}...")
                            print(f"      💰 ¥{product['price']} | 📦 销量 {product['sales']} | 💵 成交 {trans_display} | 🏭 {product['supplier'][:20]}")

                            if valid_count >= max_results:
                                break
                        else:
                            if product['transaction_amount'] >= 10000:
                                trans_display = f"{product['transaction_amount']/10000:.1f}万元"
                            elif product['transaction_amount'] > 0:
                                trans_display = f"{product['transaction_amount']:.0f}元"
                            else:
                                trans_display = "0元"

                            if self.debug or idx <= 10:
                                print(f"  ✗ [{idx}] 过滤: 销量={product['sales']}, 成交={trans_display}")

                except Exception as e:
                    if self.debug:
                        print(f"  ✗ [{idx}] 解析失败: {e}")
                        import traceback
                        traceback.print_exc()
                    continue

            products.sort(key=lambda x: x['price'])
            print(f"\n✅ 共提取 {len(products)} 个有效商品（销量≥2 或 成交金额>1元）")

        except Exception as e:
            print(f"❌ 提取过程出错: {e}")
            import traceback
            traceback.print_exc()

        return products

    def _parse_product_item(self, item, idx):
        """解析单个商品元素"""
        product = {
            'title': '',
            'price': 0.0,
            'sales': 0,
            'transaction_amount': 0.0,
            'transaction_text': '',
            'stock': '未知',
            'supplier': '',
            'url': ''
        }

        try:
            import re

            item_full_text = item.text

            # ===== 1. 标题 =====
            title_selectors = [
                ".title", ".offer-title", "a[title]", "h3", "h4",
                ".mojar-text-link", "[class*='title']", "[class*='Title']"
            ]
            for sel in title_selectors:
                try:
                    elem = item.find_element(By.CSS_SELECTOR, sel)
                    title_text = elem.text.strip() or elem.get_attribute('title') or ''
                    if title_text and '成交' not in title_text and len(title_text) > 3:
                        product['title'] = title_text
                        break
                except:
                    continue

            # ===== 2. 价格 =====
            price_selectors = [
                ".price", ".price-num", ".offer-price", ".value",
                ".mojar-number", "[class*='price']", "[class*='Price']"
            ]
            for sel in price_selectors:
                try:
                    elem = item.find_element(By.CSS_SELECTOR, sel)
                    price_text = elem.text.strip()
                    if '成交' in price_text:
                        continue
                    prices = re.findall(r'\d+\.?\d*', price_text)
                    if prices:
                        product['price'] = float(prices[0])
                        break
                except:
                    continue

            # ===== 3. 销量 =====
            sales_selectors = [
                ".sale-num", ".sales", ".sold", ".trade-num",
                ".sale", "[class*='sale']", "[class*='sold']", "[class*='Sale']"
            ]
            for sel in sales_selectors:
                try:
                    elem = item.find_element(By.CSS_SELECTOR, sel)
                    sales_text = elem.text.strip()
                    if '成交' in sales_text or '元' in sales_text:
                        continue
                    sales_text = sales_text.replace('+', '').replace('笔', '').replace('件', '').replace('已售', '')
                    sales = re.findall(r'\d+', sales_text)
                    if sales:
                        product['sales'] = int(sales[0])
                        break
                except:
                    continue

            # ===== 4. 成交金额 =====
            transaction_selectors = [
                "[class*='dealAmount']", "[class*='DealAmount']",
                "[class*='deal-amount']", "[class*='transaction']",
                "[class*='amount']", "[class*='Amount']"
            ]

            found_transaction = False
            for sel in transaction_selectors:
                try:
                    elems = item.find_elements(By.CSS_SELECTOR, sel)
                    for elem in elems:
                        text = elem.text.strip()
                        if '成交' in text and ('元' in text or '万' in text):
                            product['transaction_text'] = text
                            product['transaction_amount'] = self.parse_transaction_amount(text)
                            found_transaction = True
                            break
                    if found_transaction:
                        break
                except:
                    continue

            if not found_transaction and item_full_text:
                patterns = [
                    r'成交[\d+\.万千]+元',
                    r'成交\s*[\d+\.万千]+\s*元'
                ]
                for pattern in patterns:
                    match = re.search(pattern, item_full_text)
                    if match:
                        product['transaction_text'] = match.group().strip()
                        product['transaction_amount'] = self.parse_transaction_amount(match.group())
                        found_transaction = True
                        break

            # ===== 5. 库存 =====
            for sel in [".stock", ".inventory", ".kucun", "[class*='stock']", "[class*='Stock']"]:
                try:
                    elem = item.find_element(By.CSS_SELECTOR, sel)
                    stock_text = elem.text.strip()
                    if stock_text and '成交' not in stock_text:
                        product['stock'] = stock_text
                        break
                except:
                    continue

            # ===== 6. 供应商 =====
            supplier_selectors = [
                ".company", ".shop-name", ".seller-name",
                ".store-name", "[class*='company']", "[class*='shop']",
                "[class*='Company']", "[class*='Shop']"
            ]
            for sel in supplier_selectors:
                try:
                    elem = item.find_element(By.CSS_SELECTOR, sel)
                    supplier_text = elem.text.strip()
                    if supplier_text and '成交' not in supplier_text:
                        product['supplier'] = supplier_text
                        break
                except:
                    continue

            # ===== 7. 链接 =====
            try:
                link = item.find_element(By.CSS_SELECTOR, "a")
                product['url'] = link.get_attribute('href')
            except:
                pass

        except Exception as e:
            if self.debug:
                print(f"      解析异常: {e}")

        return product if product['title'] else None

    def get_lowest_price_with_sales(self, products):
        """获取有销量的最低价商品"""
        return min(products, key=lambda x: x['price']) if products else None

    def export_to_excel(self, products, output_file='1688_products.xlsx'):
        """导出到 Excel"""
        if not products:
            print("⚠️  没有数据可导出")
            return

        df = pd.DataFrame(products)
        df = df[['title', 'price', 'sales', 'transaction_text', 'transaction_amount', 'stock', 'supplier', 'url']]
        df.columns = ['商品标题', '价格(元)', '销量', '成交描述', '成交金额(元)', '库存', '供应商', '链接']

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f"1688_商品数据_{timestamp}.xlsx"

        df.to_excel(output_file, index=False, engine='openpyxl')
        print(f"\n✅ 已导出到: {output_file}")
        return output_file

    def close(self):
        """安全关闭浏览器"""
        if self.driver_closed:
            return

        try:
            print("🔄 正在关闭浏览器...")
            try:
                self.driver.quit()
                self.driver_closed = True
                print("✅ 浏览器已关闭")
            except (WebDriverException, TimeoutError, ConnectionError):
                print("⚠️  正常关闭失败，尝试强制关闭")
                self._force_kill_chrome()
                self.driver_closed = True
        except Exception as e:
            print(f"⚠️  关闭时出现异常: {e}")
            self._force_kill_chrome()
            self.driver_closed = True

    def _force_kill_chrome(self):
        """强制终止进程"""
        try:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/F', '/IM', 'chrome.exe'],
                             stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
                subprocess.run(['taskkill', '/F', '/IM', 'chromedriver.exe'],
                             stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
                print("✅ 已强制终止 Chrome 进程")
        except:
            pass


# ============================================================
# 主程序
# ============================================================

def main():
    """主函数"""
    print("=" * 70)
    print("  1688 以图搜图商品采集工具 v4.0（增强反爬版本）")
    print("=" * 70 + "\n")

    image_path = input("请输入产品图片路径: ").strip().strip('"')

    if not os.path.exists(image_path):
        print(f"❌ 文件不存在: {image_path}")
        return

    debug_choice = input("是否开启调试模式？(y/n，默认n): ").strip().lower()
    debug_mode = (debug_choice == 'y')

    print(f"📌 筛选条件：销量 ≥ 2 或 成交金额 > 1元")
    if debug_mode:
        print(f"🔍 调试模式：已开启\n")
    else:
        print()

    with no_proxy_context():
        scraper = None
        try:
            scraper = Alibaba1688Scraper(headless=False, use_profile=True, debug=debug_mode)

            is_logged_in = scraper.check_login_status()

            if not is_logged_in:
                print("\n⚠️  检测到未登录，建议先登录以获得更好效果")
                choice = input("是否现在登录？(y/n，默认n): ").strip().lower()
                if choice == 'y':
                    scraper.manual_login()

            print("\n" + "=" * 70)
            print("开始执行采集任务")
            print("=" * 70 + "\n")

            result_url = scraper.search_by_image(image_path, retry_count=3)
            if not result_url:
                print("❌ 搜索失败")
                return

            print(f"\n✅ 搜索结果页: {result_url}\n")

            print("⚠️  提示：程序会自动滚动页面加载更多商品，请稍等...")
            print("💡 程序会模拟真实用户浏览行为（随机延时、自然滚动）\n")

            input("准备好后按回车开始提取数据...")

            products = scraper.extract_products(max_results=30)

            if not products:
                print("\n❌ 未找到符合条件的商品（销量≥2 或 成交金额>1元）")
                print("\n💡 建议：")
                print("   1. 重新运行并开启调试模式查看详细信息")
                print("   2. 手动滚动页面到底部后再按回车")
                print("   3. 检查页面是否正常显示商品")
                return

            best_product = scraper.get_lowest_price_with_sales(products)

            if best_product:
                if best_product['transaction_amount'] >= 10000:
                    trans_display = f"{best_product['transaction_amount']/10000:.1f}万元"
                elif best_product['transaction_amount'] > 0:
                    trans_display = f"{best_product['transaction_amount']:.0f}元"
                else:
                    trans_display = "未知"

                print("\n" + "=" * 70)
                print("🏆 符合条件的最低价商品:")
                print("=" * 70)
                print(f"📦 标题: {best_product['title']}")
                print(f"💰 价格: ¥{best_product['price']}")
                print(f"📊 销量: {best_product['sales']} 件")
                print(f"💵 成交: {best_product['transaction_text'] or trans_display}")
                print(f"📦 库存: {best_product['stock']}")
                print(f"🏭 供应商: {best_product['supplier']}")
                print(f"🔗 链接: {best_product['url']}")
                print("=" * 70 + "\n")

            scraper.export_to_excel(products)

            print("\n📊 统计信息:")
            print(f"   总共找到符合条件的商品: {len(products)} 个")
            if products:
                prices = [p['price'] for p in products]
                sales_list = [p['sales'] for p in products]
                amounts = [p['transaction_amount'] for p in products if p['transaction_amount'] > 0]
                print(f"   价格区间: ¥{min(prices):.2f} ~ ¥{max(prices):.2f}")
                print(f"   销量区间: {min(sales_list)} ~ {max(sales_list)} 件")
                if amounts:
                    print(f"   成交金额区间: ¥{min(amounts):.0f} ~ ¥{max(amounts):.0f}")
                    print(f"   平均成交额: ¥{sum(amounts)/len(amounts):.0f}")
                print(f"   平均价格: ¥{sum(prices)/len(prices):.2f}")
                if sales_list:
                    print(f"   平均销量: {sum(sales_list)//len(sales_list)} 件")

        except KeyboardInterrupt:
            print("\n\n⚠️  用户中断")
        except Exception as e:
            print(f"❌ 执行出错: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if scraper:
                try:
                    input("\n按回车关闭浏览器...")
                except KeyboardInterrupt:
                    print("\n跳过等待，直接关闭...")
                scraper.close()
                time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ 程序异常: {e}")
    finally:
        print("\n程序结束")