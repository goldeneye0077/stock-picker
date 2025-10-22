/**
 * 响应辅助函数
 * 提供统一的成功和错误响应格式
 */

import { Response } from 'express';
import { AppError, ErrorCode, ErrorResponse } from './errors';

/**
 * 成功响应接口
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T = any> {
  success: true;
  data: T[];
  total: number;
  page?: number;
  pageSize?: number;
  message?: string;
}

/**
 * 发送成功响应
 * @param res Express Response 对象
 * @param data 响应数据
 * @param message 可选的成功消息
 * @param statusCode HTTP 状态码（默认 200）
 */
export function sendSuccess<T = any>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message })
  };

  return res.status(statusCode).json(response);
}

/**
 * 发送分页成功响应
 * @param res Express Response 对象
 * @param data 响应数据数组
 * @param total 总记录数
 * @param page 当前页码
 * @param pageSize 每页大小
 * @param message 可选的成功消息
 */
export function sendPaginatedSuccess<T = any>(
  res: Response,
  data: T[],
  total: number,
  page?: number,
  pageSize?: number,
  message?: string
): Response {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    total,
    ...(page !== undefined && { page }),
    ...(pageSize !== undefined && { pageSize }),
    ...(message && { message })
  };

  return res.status(200).json(response);
}

/**
 * 发送错误响应
 * @param res Express Response 对象
 * @param error 错误对象（AppError 或 Error）
 * @param includeStack 是否包含堆栈信息（开发环境）
 */
export function sendError(
  res: Response,
  error: AppError | Error,
  includeStack: boolean = false
): Response {
  // 如果是自定义应用错误
  if (error instanceof AppError) {
    const errorResponse: ErrorResponse = {
      success: false,
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      ...(includeStack && { stack: error.stack })
    };

    return res.status(error.statusCode).json(errorResponse);
  }

  // 处理未预期的错误
  const errorResponse: ErrorResponse = {
    success: false,
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: error.message || 'Internal server error',
    ...(includeStack && { stack: error.stack })
  };

  return res.status(500).json(errorResponse);
}

/**
 * 发送自定义错误响应
 * @param res Express Response 对象
 * @param statusCode HTTP 状态码
 * @param code 错误代码
 * @param message 错误消息
 * @param details 可选的详细信息
 */
export function sendCustomError(
  res: Response,
  statusCode: number,
  code: ErrorCode | string,
  message: string,
  details?: any
): Response {
  const errorResponse: ErrorResponse = {
    success: false,
    code,
    message,
    ...(details && { details })
  };

  return res.status(statusCode).json(errorResponse);
}
