import { validate } from 'openapi-validator';
import path from 'path';
import fs from 'fs';

describe('OpenAPI Contract Tests', () => {
  const openapiPath = path.join(__dirname, '../openapi.yaml');
  const openapiSpec = fs.readFileSync(openapiPath, 'utf-8');

  test('规范文件应该有效', async () => {
    const result = await validate(openapiSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('应该包含所有必需的路由', () => {
    const spec = JSON.parse(openapiSpec);

    // 检查必需的路由
    const requiredPaths = [
      '/health',
      '/api/stocks',
      '/api/stocks/{code}',
      '/api/analysis/market-overview',
      '/api/analysis/signals',
      '/api/analysis/volume'
    ];

    requiredPaths.forEach(path => {
      expect(spec.paths).toHaveProperty(path);
    });
  });

  test('每个路由应该有正确的HTTP方法', () => {
    const spec = JSON.parse(openapiSpec);

    const expectedMethods = {
      '/health': ['get'],
      '/api/stocks': ['get'],
      '/api/stocks/{code}': ['get'],
      '/api/analysis/market-overview': ['get'],
      '/api/analysis/signals': ['get'],
      '/api/analysis/volume': ['get']
    };

    Object.entries(expectedMethods).forEach(([path, methods]) => {
      methods.forEach(method => {
        expect(spec.paths[path]).toHaveProperty(method);
      });
    });
  });

  test('响应应该符合规范', () => {
    const spec = JSON.parse(openapiSpec);

    // 检查健康检查端点
    const healthPath = spec.paths['/health'];
    expect(healthPath.get.responses).toHaveProperty('200');
    expect(healthPath.get.responses['200'].content['application/json'].schema)
      .toHaveProperty('$ref', '#/components/schemas/HealthResponse');
  });

  test('参数应该有正确的验证规则', () => {
    const spec = JSON.parse(openapiSpec);

    // 检查信号查询参数
    const signalsPath = spec.paths['/api/analysis/signals'];
    const daysParam = signalsPath.get.parameters.find((p: any) => p.name === 'days');

    expect(daysParam).toBeDefined();
    expect(daysParam.schema.minimum).toBe(1);
    expect(daysParam.schema.maximum).toBe(365);
    expect(daysParam.schema.default).toBe(7);
  });

  test('安全方案应该正确定义', () => {
    const spec = JSON.parse(openapiSpec);

    expect(spec.components.securitySchemes).toHaveProperty('ApiKeyAuth');
    expect(spec.components.securitySchemes).toHaveProperty('BearerAuth');
    expect(spec.security).toBeDefined();
    expect(spec.security).toHaveLength(2);
  });
});