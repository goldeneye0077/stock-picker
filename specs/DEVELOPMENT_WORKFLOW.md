# OpenSpec 开发流程指南

## 📋 概述

本文档描述如何使用 OpenSpec 工具链进行 API 优先开发。通过 OpenAPI 规范驱动开发流程，确保 API 设计、实现和文档的一致性。

## 🚀 快速开始

### 1. 安装依赖

```bash
cd specs
npm install
```

### 2. 验证规范

```bash
npm run validate
```

### 3. 生成文档

```bash
npm run generate:docs
```

### 4. 生成 TypeScript 类型

```bash
npm run generate:types
```

## 🔄 开发流程

### 阶段 1: API 设计（设计先行）

1. **编辑 OpenAPI 规范**
   ```bash
   # 编辑主 API 规范
   vim openapi.yaml

   # 编辑数据服务规范
   vim data-service-openapi.yaml
   ```

2. **验证规范语法**
   ```bash
   npm run validate
   ```

3. **检查规范质量**
   ```bash
   npm run lint
   ```

4. **预览 API 文档**
   ```bash
   npm run preview
   ```

### 阶段 2: 代码生成

1. **生成 TypeScript 类型定义**
   ```bash
   npm run generate:types
   # 生成文件: ../frontend/src/types/api.generated.ts
   ```

2. **生成客户端代码（可选）**
   ```bash
   npm run generate:client
   # 生成文件: ../frontend/src/api/generated/
   ```

### 阶段 3: 实现开发

1. **后端实现**
   - 根据规范实现路由处理函数
   - 确保响应格式符合规范
   - 使用生成的类型进行类型检查

2. **前端集成**
   - 导入生成的 TypeScript 类型
   - 使用类型安全的 API 调用
   - 自动补全和类型检查

### 阶段 4: 测试验证

1. **运行契约测试**
   ```bash
   npm run test:contract
   ```

2. **手动测试**
   - 使用生成的文档进行测试
   - 验证实际响应是否符合规范

## 📁 目录结构

```
specs/
├── openapi.yaml              # 主 API 规范
├── data-service-openapi.yaml # 数据服务规范
├── .spectral.yaml           # 规范检查规则
├── redocly.yaml            # 文档生成配置
├── package.json            # 工具配置
├── jest.config.js          # 测试配置
├── __tests__/              # 契约测试
│   └── contract.test.ts
├── dist/                   # 生成文件目录
│   ├── openapi.bundle.yaml
│   ├── data-service-openapi.bundle.yaml
│   └── docs.html
└── DEVELOPMENT_WORKFLOW.md # 本文档
```

## 🛠️ 工具说明

### 1. Swagger CLI
- **用途**: 规范验证和打包
- **命令**: `npm run validate`, `npm run bundle`
- **输出**: 验证结果、打包后的规范文件

### 2. Spectral
- **用途**: 规范质量检查
- **命令**: `npm run lint`
- **规则**: 自定义规则在 `.spectral.yaml`

### 3. Redocly
- **用途**: API 文档生成和预览
- **命令**: `npm run generate:docs`, `npm run preview`
- **配置**: `redocly.yaml`

### 4. openapi-typescript
- **用途**: 生成 TypeScript 类型定义
- **命令**: `npm run generate:types`
- **输出**: `../frontend/src/types/api.generated.ts`

### 5. Jest
- **用途**: 契约测试
- **命令**: `npm run test:contract`
- **测试**: 验证规范完整性和一致性

## 📝 规范编写指南

### 1. 路径定义
```yaml
paths:
  /api/stocks/{code}:
    get:
      tags: [stocks]
      summary: 获取股票详情
      parameters:
        - name: code
          in: path
          required: true
          schema:
            type: string
            pattern: '^[0-9]{6}\.(SZ|SH)$'
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StockDetailResponse'
```

### 2. 组件定义
```yaml
components:
  schemas:
    StockItem:
      type: object
      required: [code, name, exchange]
      properties:
        code:
          type: string
          description: 股票代码
        name:
          type: string
          description: 股票名称
        exchange:
          type: string
          enum: [SZ, SH]
```

### 3. 安全方案
```yaml
securitySchemes:
  ApiKeyAuth:
    type: apiKey
    in: header
    name: X-API-Key
  BearerAuth:
    type: http
    scheme: bearer
    bearerFormat: JWT
```

## 🔍 质量检查规则

### 必填项检查
- 每个操作必须有 `summary` 和 `description`
- 每个参数必须有 `description`
- 每个响应必须有 `description`

### 类型安全
- 禁止使用 `any` 类型
- 枚举值必须使用蛇形命名
- 数字类型必须有范围限制

### 安全要求
- 所有接口必须定义安全方案
- 敏感操作需要额外权限

### 版本控制
- API 版本应该在请求头中
- 向后兼容性变更

## 🚨 常见问题

### 1. 规范验证失败
```bash
# 查看详细错误
npm run validate -- --verbose

# 修复常见错误
# - 缺少 required 字段
# - 类型不匹配
# - 引用不存在
```

### 2. 类型生成错误
```bash
# 检查规范语法
npm run validate

# 手动检查问题
openapi-typescript openapi.yaml --debug
```

### 3. 文档生成问题
```bash
# 清理缓存
rm -rf dist/

# 重新生成
npm run generate:docs
```

### 4. 契约测试失败
```bash
# 运行单个测试
npm run test:contract -- --testNamePattern="规范文件应该有效"

# 查看详细输出
npm run test:contract -- --verbose
```

## 📈 最佳实践

### 1. 增量更新
- 每次只修改一个端点
- 及时验证规范
- 提交前运行所有检查

### 2. 版本控制
- 规范文件纳入版本控制
- 每次变更记录变更日志
- 使用语义化版本

### 3. 团队协作
- 规范评审作为代码评审的一部分
- 使用分支进行规范修改
- 合并前必须通过所有检查

### 4. 持续集成
- 规范验证作为 CI 步骤
- 自动生成文档和类型
- 契约测试作为质量门禁

## 🔗 相关资源

- [OpenAPI 3.0 规范](https://spec.openapis.org/oas/v3.0.3)
- [Spectral 文档](https://meta.stoplight.io/docs/spectral)
- [Redocly 文档](https://redocly.com/docs)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)