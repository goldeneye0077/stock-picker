/**
 * 统一错误处理工具
 * 定义自定义错误类和错误代码枚举
 */

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 客户端错误 4xx
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',

  // 服务器错误 5xx
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // 业务错误
  STOCK_NOT_FOUND = 'STOCK_NOT_FOUND',
  DATA_FETCH_ERROR = 'DATA_FETCH_ERROR',
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',
}

/**
 * 错误响应接口
 */
export interface ErrorResponse {
  success: false;
  code: ErrorCode | string;
  message: string;
  details?: any;
  stack?: string;
}

/**
 * 自定义应用错误基类
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode | string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode | string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // 维护正确的堆栈跟踪（仅在 V8 引擎中）
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * 验证错误 (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 参数无效错误 (400)
 */
export class InvalidParameterError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.INVALID_PARAMETER, details);
    Object.setPrototypeOf(this, InvalidParameterError.prototype);
  }
}

/**
 * 资源未找到错误 (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, ErrorCode.NOT_FOUND, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 股票未找到错误 (404)
 */
export class StockNotFoundError extends AppError {
  constructor(stockCode: string) {
    super(
      `Stock with code '${stockCode}' not found`,
      404,
      ErrorCode.STOCK_NOT_FOUND,
      { stockCode }
    );
    Object.setPrototypeOf(this, StockNotFoundError.prototype);
  }
}

/**
 * 数据库错误 (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, ErrorCode.DATABASE_ERROR, details, false);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * 内部服务器错误 (500)
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, ErrorCode.INTERNAL_SERVER_ERROR, details, false);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * 数据获取错误 (500)
 */
export class DataFetchError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, ErrorCode.DATA_FETCH_ERROR, details);
    Object.setPrototypeOf(this, DataFetchError.prototype);
  }
}

/**
 * 分析错误 (500)
 */
export class AnalysisError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, ErrorCode.ANALYSIS_ERROR, details);
    Object.setPrototypeOf(this, AnalysisError.prototype);
  }
}
