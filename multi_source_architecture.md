# 多数据源架构设计

## 一、设计目标

### 1.1 核心目标
- **提高数据可靠性**：主数据源故障时自动切换到备用数据源
- **增强数据一致性**：多源数据对比验证，确保数据准确性
- **提升系统可用性**：避免单点故障，保证数据服务持续可用
- **支持数据源扩展**：易于添加新的数据源，支持多种数据格式

### 1.2 设计原则
1. **抽象接口**：统一的数据源访问接口
2. **插件化架构**：支持热插拔数据源
3. **智能切换**：基于健康状态的自动切换策略
4. **数据验证**：多源数据一致性检查
5. **性能优化**：缓存和并发处理

## 二、架构设计

### 2.1 整体架构
```
┌─────────────────────────────────────────────┐
│                应用层                        │
│  ┌─────────────────────────────────────┐  │
│  │        多数据源管理器                │  │
│  │  • 数据源注册/注销                  │  │
│  │  • 智能路由选择                     │  │
│  │  • 故障切换                        │  │
│  │  • 数据一致性验证                  │  │
│  └─────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│                抽象层                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │数据源接口│  │健康检查器│  │缓存管理器│  │
│  └─────────┘  └─────────┘  └─────────┘  │
├─────────────────────────────────────────────┤
│                实现层                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │Tushare  │  │AKShare  │  │Baostock │  │
│  │客户端   │  │客户端   │  │客户端   │  │
│  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 数据源接口 (DataSource Interface)
```python
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
import pandas as pd

class DataSource(ABC):
    """数据源抽象基类"""

    @abstractmethod
    async def get_stock_basic(self) -> Optional[pd.DataFrame]:
        """获取股票基本信息"""
        pass

    @abstractmethod
    async def get_daily_data(self, ts_code: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
        """获取日线数据"""
        pass

    @abstractmethod
    async def get_daily_data_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """按日期获取日线数据"""
        pass

    @abstractmethod
    async def get_moneyflow_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """获取资金流向数据"""
        pass

    @abstractmethod
    async def get_daily_basic_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """获取每日技术指标"""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """检查数据源是否可用"""
        pass

    @abstractmethod
    def get_source_name(self) -> str:
        """获取数据源名称"""
        pass
```

#### 2.2.2 健康检查器 (HealthChecker)
```python
class DataSourceHealth:
    """数据源健康状态"""

    def __init__(self, source_name: str):
        self.source_name = source_name
        self.status = "unknown"  # healthy, degraded, unavailable
        self.success_rate = 0.0
        self.avg_latency = 0.0
        self.last_check_time = None
        self.error_message = ""
        self.data_freshness = 0.0  # 数据新鲜度

class HealthChecker:
    """健康检查器"""

    async def check_health(self, source: DataSource) -> DataSourceHealth:
        """检查数据源健康状态"""
        health = DataSourceHealth(source.get_source_name())

        try:
            # 1. 检查可用性
            if not source.is_available():
                health.status = "unavailable"
                health.error_message = "数据源不可用"
                return health

            # 2. 测试基本功能
            start_time = time.time()
            test_result = await self._run_health_tests(source)
            health.avg_latency = (time.time() - start_time) / len(test_result)

            # 3. 计算成功率
            success_count = sum(1 for r in test_result if r["success"])
            health.success_rate = success_count / len(test_result)

            # 4. 确定状态
            if health.success_rate >= 0.95:
                health.status = "healthy"
            elif health.success_rate >= 0.80:
                health.status = "degraded"
            else:
                health.status = "unavailable"

            health.last_check_time = datetime.now()

        except Exception as e:
            health.status = "unavailable"
            health.error_message = str(e)

        return health
```

#### 2.2.3 多数据源管理器 (MultiSourceManager)
```python
class MultiSourceManager:
    """多数据源管理器"""

    def __init__(self):
        self.sources = {}  # name -> DataSource
        self.health_status = {}  # name -> DataSourceHealth
        self.preferred_source = None
        self.fallback_order = []
        self.cache = {}

    def register_source(self, source: DataSource):
        """注册数据源"""
        name = source.get_source_name()
        self.sources[name] = source
        logger.info(f"注册数据源: {name}")

    def set_preferred_source(self, source_name: str):
        """设置首选数据源"""
        if source_name in self.sources:
            self.preferred_source = source_name
            logger.info(f"设置首选数据源: {source_name}")
        else:
            logger.warning(f"数据源不存在: {source_name}")

    def set_fallback_order(self, order: List[str]):
        """设置备用数据源顺序"""
        self.fallback_order = order
        logger.info(f"设置备用顺序: {order}")

    async def get_with_fallback(self, method_name: str, *args, **kwargs):
        """
        带故障切换的数据获取

        Args:
            method_name: 方法名，如 'get_daily_data'
            *args, **kwargs: 方法参数

        Returns:
            数据或None（所有数据源都失败）
        """
        # 1. 尝试首选数据源
        if self.preferred_source and self.preferred_source in self.sources:
            source = self.sources[self.preferred_source]
            result = await self._try_source(source, method_name, *args, **kwargs)
            if result is not None:
                return result

        # 2. 按备用顺序尝试
        for source_name in self.fallback_order:
            if source_name in self.sources:
                source = self.sources[source_name]
                result = await self._try_source(source, method_name, *args, **kwargs)
                if result is not None:
                    return result

        # 3. 尝试所有数据源
        for source_name, source in self.sources.items():
            if source_name != self.preferred_source and source_name not in self.fallback_order:
                result = await self._try_source(source, method_name, *args, **kwargs)
                if result is not None:
                    return result

        logger.error(f"所有数据源都失败: {method_name}")
        return None

    async def _try_source(self, source: DataSource, method_name: str, *args, **kwargs):
        """尝试从单个数据源获取数据"""
        try:
            if not source.is_available():
                return None

            method = getattr(source, method_name)
            result = await method(*args, **kwargs)

            if result is not None:
                # 更新健康状态
                self._update_health_status(source, success=True)
                return result
            else:
                self._update_health_status(source, success=False, error="返回空数据")
                return None

        except Exception as e:
            self._update_health_status(source, success=False, error=str(e))
            logger.warning(f"数据源 {source.get_source_name()} 失败: {e}")
            return None
```

## 三、数据源实现

### 3.1 Tushare客户端 (现有)
- **类型**: 主数据源
- **特点**: 数据全面、更新及时、需要Token
- **限制**: API调用频率限制

### 3.2 AKShare客户端
```python
class AKShareClient(DataSource):
    """AKShare数据源客户端"""

    def __init__(self):
        try:
            import akshare as ak
            self.ak = ak
            self.available = True
        except ImportError:
            self.available = False
            logger.warning("AKShare not available. Install with: pip install akshare")

    async def get_stock_basic(self) -> Optional[pd.DataFrame]:
        """获取股票基本信息"""
        if not self.available:
            return None

        try:
            # AKShare的股票列表接口
            df = self.ak.stock_info_a_code_name()
            # 转换为标准格式
            return self._convert_to_standard_format(df)
        except Exception as e:
            logger.error(f"AKShare获取股票列表失败: {e}")
            return None

    async def get_daily_data(self, ts_code: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
        """获取日线数据"""
        if not self.available:
            return None

        try:
            # 解析股票代码和市场
            code, exchange = ts_code.split('.')

            if exchange == 'SZ':
                df = self.ak.stock_zh_a_hist(symbol=code, period="daily",
                                            start_date=start_date, end_date=end_date)
            elif exchange == 'SH':
                df = self.ak.stock_sh_a_hist(symbol=code, period="daily",
                                            start_date=start_date, end_date=end_date)
            else:
                return None

            return self._convert_daily_format(df, ts_code)
        except Exception as e:
            logger.error(f"AKShare获取日线数据失败 {ts_code}: {e}")
            return None
```

### 3.3 Baostock客户端
```python
class BaostockClient(DataSource):
    """Baostock数据源客户端"""

    def __init__(self):
        try:
            import baostock as bs
            self.bs = bs
            self.available = True
            # 登录（Baostock需要登录）
            lg = bs.login()
            if lg.error_code != '0':
                logger.warning(f"Baostock登录失败: {lg.error_msg}")
                self.available = False
        except ImportError:
            self.available = False
            logger.warning("Baostock not available. Install with: pip install baostock")

    async def get_stock_basic(self) -> Optional[pd.DataFrame]:
        """获取股票基本信息"""
        if not self.available:
            return None

        try:
            # Baostock的股票列表
            rs = self.bs.query_all_stock(day=datetime.now().strftime('%Y-%m-%d'))
            data_list = []
            while (rs.error_code == '0') & rs.next():
                data_list.append(rs.get_row_data())
            df = pd.DataFrame(data_list, columns=rs.fields)
            return self._convert_to_standard_format(df)
        except Exception as e:
            logger.error(f"Baostock获取股票列表失败: {e}")
            return None
```

## 四、数据一致性验证

### 4.1 验证策略
```python
class DataConsistencyValidator:
    """数据一致性验证器"""

    def __init__(self, tolerance: float = 0.01):
        self.tolerance = tolerance  # 允许的误差范围

    async def validate_consistency(self, data1: pd.DataFrame, data2: pd.DataFrame,
                                  data_type: str) -> Dict[str, Any]:
        """
        验证两个数据源的数据一致性

        Args:
            data1: 数据源1的数据
            data2: 数据源2的数据
            data_type: 数据类型，如 'daily', 'moneyflow'

        Returns:
            一致性验证结果
        """
        if data1 is None or data2 is None:
            return {
                "consistent": False,
                "reason": "其中一个数据源返回空数据",
                "match_rate": 0.0
            }

        # 1. 检查数据形状
        if data1.shape != data2.shape:
            return {
                "consistent": False,
                "reason": f"数据形状不匹配: {data1.shape} vs {data2.shape}",
                "match_rate": 0.0
            }

        # 2. 数值一致性检查
        numeric_columns = data1.select_dtypes(include=[np.number]).columns

        match_results = []
        for col in numeric_columns:
            if col in data2.columns:
                col1 = data1[col].fillna(0)
                col2 = data2[col].fillna(0)

                # 计算相对误差
                diff = abs(col1 - col2)
                rel_error = diff / (abs(col1) + 1e-10)  # 避免除零

                match_rate = (rel_error <= self.tolerance).mean()
                match_results.append({
                    "column": col,
                    "match_rate": match_rate,
                    "avg_error": rel_error.mean()
                })

        # 3. 计算总体匹配率
        overall_match_rate = np.mean([r["match_rate"] for r in match_results])

        return {
            "consistent": overall_match_rate >= 0.95,
            "match_rate": overall_match_rate,
            "column_results": match_results,
            "data1_sample": data1.head(3).to_dict(),
            "data2_sample": data2.head(3).to_dict()
        }
```

### 4.2 定期验证任务
```python
class ConsistencyMonitor:
    """一致性监控器"""

    def __init__(self, multi_source_manager: MultiSourceManager):
        self.manager = multi_source_manager
        self.validation_results = []

    async def run_validation(self):
        """运行一致性验证"""
        logger.info("开始数据一致性验证...")

        sources = list(self.manager.sources.keys())
        if len(sources) < 2:
            logger.warning("至少需要2个数据源才能进行一致性验证")
            return

        # 对每对数据源进行验证
        for i in range(len(sources)):
            for j in range(i + 1, len(sources)):
                source1_name = sources[i]
                source2_name = sources[j]

                result = await self._validate_pair(source1_name, source2_name)
                self.validation_results.append(result)

                if result["consistent"]:
                    logger.info(f"{source1_name} vs {source2_name}: 一致")
                else:
                    logger.warning(f"{source1_name} vs {source2_name}: 不一致, 匹配率: {result['match_rate']:.1%}")

    async def _validate_pair(self, source1_name: str, source2_name: str):
        """验证一对数据源"""
        # 获取测试数据（例如最近一天的日线数据）
        test_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')

        source1 = self.manager.sources[source1_name]
        source2 = self.manager.sources[source2_name]

        # 获取数据
        data1 = await source1.get_daily_data_by_date(test_date)
        data2 = await source2.get_daily_data_by_date(test_date)

        # 验证一致性
        validator = DataConsistencyValidator()
        result = await validator.validate_consistency(data1, data2, "daily")

        return {
            "source1": source1_name,
            "source2": source2_name,
            "test_date": test_date,
            **result,
            "timestamp": datetime.now().isoformat()
        }
```

## 五、配置管理

### 5.1 配置文件
```yaml
# config/multi_source.yaml
data_sources:
  primary: "tushare"
  fallback_order: ["akshare", "baostock"]

  tushare:
    enabled: true
    token: "${TUSHARE_TOKEN}"
    priority: 1

  akshare:
    enabled: true
    priority: 2

  baostock:
    enabled: true
    priority: 3

health_check:
  interval_minutes: 5
  failure_threshold: 3
  recovery_threshold: 5

consistency_check:
  enabled: true
  interval_hours: 24
  tolerance: 0.01

caching:
  enabled: true
  ttl_minutes: 60
  max_size_mb: 100
```

### 5.2 动态配置
```python
class MultiSourceConfig:
    """多数据源配置"""

    def __init__(self, config_path: str = None):
        self.config = self._load_config(config_path)
        self._validate_config()

    def _load_config(self, config_path: str):
        """加载配置"""
        default_config = {
            "data_sources": {
                "primary": "tushare",
                "fallback_order": ["akshare", "baostock"],
                "tushare": {"enabled": True, "priority": 1},
                "akshare": {"enabled": True, "priority": 2},
                "baostock": {"enabled": True, "priority": 3}
            },
            "health_check": {
                "interval_minutes": 5,
                "failure_threshold": 3,
                "recovery_threshold": 5
            }
        }

        if config_path and os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                user_config = yaml.safe_load(f)
                # 合并配置
                return self._merge_configs(default_config, user_config)

        return default_config

    def get_enabled_sources(self) -> List[str]:
        """获取启用的数据源列表"""
        enabled = []
        for name, config in self.config["data_sources"].items():
            if name not in ["primary", "fallback_order"]:
                if config.get("enabled", False):
                    enabled.append(name)
        return enabled
```

## 六、集成到现有系统

### 6.1 修改现有代码
```python
# 在 data_collection.py 中
from multi_source_manager import MultiSourceManager, TushareClient, AKShareClient, BaostockClient
from multi_source_config import MultiSourceConfig

# 初始化多数据源管理器
config = MultiSourceConfig()
manager = MultiSourceManager()

# 注册数据源
if config.is_source_enabled("tushare"):
    manager.register_source(TushareClient())
if config.is_source_enabled("akshare"):
    manager.register_source(AKShareClient())
if config.is_source_enabled("baostock"):
    manager.register_source(BaostockClient())

# 设置首选和备用顺序
manager.set_preferred_source(config.get_primary_source())
manager.set_fallback_order(config.get_fallback_order())

# 修改现有API，使用多数据源
@router.post("/fetch-klines/{stock_code}")
async def fetch_stock_klines(stock_code: str, background_tasks: BackgroundTasks, days: int = 30):
    """获取K线数据（使用多数据源）"""
    try:
        # 使用多数据源管理器
        result = await manager.get_with_fallback(
            "get_daily_data",
            stock_code,
            start_date=(datetime.now() - timedelta(days=days)).strftime('%Y%m%d'),
            end_date=datetime.now().strftime('%Y%m%d')
        )

        if result is None:
            raise HTTPException(status_code=500, detail="所有数据源都失败")

        # 处理结果...

    except Exception as e:
        logger.error(f"Error starting K-line fetch: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### 6.2 新增监控API
```python
@router.get("/multi-source/status")
async def get_multi_source_status():
    """获取多数据源状态"""
    try:
        status = {
            "primary_source": manager.preferred_source,
            "fallback_order": manager.fallback_order,
            "sources": {}
        }

        for name, source in manager.sources.items():
            health = manager.health_status.get(name, {})
            status["sources"][name] = {
                "available": source.is_available(),
                "health": health.status if health else "unknown",
                "success_rate": health.success_rate if health else 0.0,
                "last_check": health.last_check_time.isoformat() if health and health.last_check_time else None
            }

        return {"success": True, "data": status}

    except Exception as e:
        logger.error(f"获取多数据源状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/multi-source/consistency")
async def get_consistency_report(days: int = 7):
    """获取数据一致性报告"""
    try:
        monitor = ConsistencyMonitor(manager)
        await monitor.run_validation()

        return {
            "success": True,
            "data": {
                "validation_results": monitor.validation_results,
                "summary": {
                    "total_validations": len(monitor.validation_results),
                    "consistent_pairs": sum(1 for r in monitor.validation_results if r["consistent"]),
                    "avg_match_rate": np.mean([r["match_rate"] for r in monitor.validation_results])
                }
            }
        }

    except Exception as e:
        logger.error(f"获取一致性报告失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

## 七、实施计划

### 7.1 第一阶段：基础架构（1周）
1. 设计抽象接口和基础类
2. 实现多数据源管理器核心逻辑
3. 创建健康检查器
4. 编写单元测试

### 7.2 第二阶段：数据源实现（1周）
1. 实现AKShare客户端
2. 实现Baostock客户端
3. 数据格式转换和适配
4. 集成测试

### 7.3 第三阶段：高级功能（1周）
1. 实现数据一致性验证
2. 添加缓存机制
3. 实现配置管理
4. 性能优化

### 7.4 第四阶段：集成部署（3天）
1. 集成到现有系统
2. 添加监控API
3. 部署和测试
4. 文档编写

## 八、预期效果

### 8.1 可靠性提升
- **系统可用性**: 从单数据源的~99%提升到多数据源的~99.99%
- **故障恢复时间**: 从手动恢复（小时级）到自动切换（秒级）

### 8.2 数据质量提升
- **数据一致性**: 多源验证确保数据准确性
- **数据完整性**: 备用数据源补充缺失数据

### 8.3 运维效率提升
- **自动化监控**: 实时健康状态监控
- **智能告警**: 异常自动告警和切换
- **易于扩展**: 支持快速添加新数据源

## 九、风险控制

### 9.1 技术风险
- **数据格式不一致**: 通过标准化接口和格式转换解决
- **API接口变更**: 通过抽象层隔离变化
- **性能影响**: 通过缓存和异步处理优化

### 9.2 业务风险
- **数据延迟**: 设置合理的超时和重试机制
- **成本增加**: 合理使用免费数据源，控制API调用

### 9.3 实施风险
- **兼容性问题**: 充分测试，逐步迁移
- **学习曲线**: 提供详细文档和示例