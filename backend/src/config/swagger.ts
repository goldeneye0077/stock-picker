/**
 * Swagger API 文档配置
 */

import swaggerJsdoc from 'swagger-jsdoc';

const port = process.env.PORT || '3000';
const swaggerServerUrl = process.env.SWAGGER_SERVER_URL || `http://localhost:${port}`;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '智能选股系统 API',
      version: '1.0.0',
      description: '基于成交量和K线走势分析主力资金介入的智能选股系统API文档',
      contact: {
        name: 'API Support',
        email: 'support@stock-picker.com'
      }
    },
    servers: [
      {
        url: swaggerServerUrl,
        description: '开发环境'
      },
      {
        url: swaggerServerUrl,
        description: '生产环境'
      }
    ],
    tags: [
      {
        name: 'Stocks',
        description: '股票数据相关接口'
      },
      {
        name: 'Analysis',
        description: '资金分析相关接口'
      },
      {
        name: 'System',
        description: '系统相关接口'
      }
    ],
    components: {
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: '响应数据'
            },
            message: {
              type: 'string',
              description: '响应消息（可选）'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            code: {
              type: 'string',
              description: '错误代码'
            },
            message: {
              type: 'string',
              description: '错误消息'
            },
            details: {
              type: 'object',
              description: '错误详情（可选）'
            }
          }
        },
        Stock: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: '股票代码',
              example: '000001'
            },
            name: {
              type: 'string',
              description: '股票名称',
              example: '平安银行'
            },
            exchange: {
              type: 'string',
              description: '交易所',
              example: 'SZ'
            },
            industry: {
              type: 'string',
              description: '所属行业',
              example: '银行'
            },
            current_price: {
              type: 'number',
              format: 'float',
              description: '最新价',
              example: 12.50
            },
            change_percent: {
              type: 'number',
              format: 'float',
              description: '涨跌幅(%)',
              example: 2.45
            },
            volume: {
              type: 'number',
              description: '成交量',
              example: 1000000
            },
            amount: {
              type: 'number',
              description: '成交额',
              example: 12500000
            }
          }
        },
        FundFlow: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                totalMainFlow: {
                  type: 'number',
                  description: '主力资金流向'
                },
                totalRetailFlow: {
                  type: 'number',
                  description: '散户资金流向'
                },
                totalInstitutionalFlow: {
                  type: 'number',
                  description: '机构资金流向'
                }
              }
            }
          }
        },
        VolumeSurge: {
          type: 'object',
          properties: {
            stock_code: {
              type: 'string',
              description: '股票代码'
            },
            stock_name: {
              type: 'string',
              description: '股票名称'
            },
            volume_ratio: {
              type: 'number',
              description: '量比'
            },
            change_percent: {
              type: 'number',
              description: '涨跌幅'
            }
          }
        },
        BuySignal: {
          type: 'object',
          properties: {
            stock_code: {
              type: 'string',
              description: '股票代码'
            },
            stock_name: {
              type: 'string',
              description: '股票名称'
            },
            signal_type: {
              type: 'string',
              description: '信号类型',
              enum: ['买入', '持有', '观察', '卖出']
            },
            signal_strength: {
              type: 'number',
              description: '信号强度',
              minimum: 0,
              maximum: 100
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: '信号生成时间'
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts'] // 扫描路由文件中的JSDoc注释
};

export const swaggerSpec = swaggerJsdoc(options);
