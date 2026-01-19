const fs = require('fs');
const path = require('path');
const { parseYaml } = require('@redocly/openapi-core');

describe('OpenAPI Contract Tests', () => {
  const openapiPath = path.join(__dirname, '../openapi.yaml');
  const openapiSpecText = fs.readFileSync(openapiPath, 'utf-8');
  const openapiSpec = parseYaml(openapiSpecText);

  test('规范文件应该有效', () => {
    expect(openapiSpec).toBeDefined();
    expect(openapiSpec.openapi).toBeDefined();
    expect(openapiSpec.openapi).toMatch(/^3\./);
  });

  test('应该包含所有必需的路由', () => {
    const requiredPaths = [
      '/health',
      '/api/stocks',
      '/api/stocks/{code}',
      '/api/analysis/market-overview',
      '/api/analysis/signals',
      '/api/analysis/volume',
    ];

    requiredPaths.forEach((p) => {
      expect(openapiSpec.paths).toHaveProperty(p);
    });
  });

  test('每个路由应该有正确的HTTP方法', () => {
    const expectedMethods = {
      '/health': ['get'],
      '/api/stocks': ['get'],
      '/api/stocks/{code}': ['get'],
      '/api/analysis/market-overview': ['get'],
      '/api/analysis/signals': ['get'],
      '/api/analysis/volume': ['get'],
    };

    Object.entries(expectedMethods).forEach(([p, methods]) => {
      methods.forEach((method) => {
        expect(openapiSpec.paths[p]).toHaveProperty(method);
      });
    });
  });

  test('响应应该符合规范', () => {
    const healthPath = openapiSpec.paths['/health'];
    expect(healthPath.get.responses).toHaveProperty('200');
    expect(healthPath.get.responses['200'].content['application/json'].schema).toHaveProperty(
      '$ref',
      '#/components/schemas/HealthResponse',
    );
  });

  test('参数应该有正确的验证规则', () => {
    const signalsPath = openapiSpec.paths['/api/analysis/signals'];
    const daysParam = (signalsPath.get.parameters || []).find((p) => p && p.name === 'days');

    expect(daysParam).toBeDefined();
    expect(daysParam.schema.minimum).toBe(1);
    expect(daysParam.schema.maximum).toBe(365);
    expect(daysParam.schema.default).toBe(7);
  });

  test('安全方案应该正确定义', () => {
    expect(openapiSpec.components.securitySchemes).toHaveProperty('ApiKeyAuth');
    expect(openapiSpec.components.securitySchemes).toHaveProperty('BearerAuth');
    expect(openapiSpec.security).toBeDefined();
    expect(Array.isArray(openapiSpec.security)).toBe(true);
    expect(openapiSpec.security.length).toBeGreaterThan(0);
  });
});

