/**
 * 全局错误处理中间件
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors';
import { sendError } from '../utils/responseHelper';

/**
 * 判断是否为开发环境
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 错误日志记录
 * @param error 错误对象
 * @param req Express Request 对象
 */
function logError(error: Error, req: Request): void {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip;

  console.error('\n=== Error Log ===');
  console.error(`Timestamp: ${timestamp}`);
  console.error(`Method: ${method}`);
  console.error(`URL: ${url}`);
  console.error(`IP: ${ip}`);
  console.error(`Message: ${error.message}`);

  if (error instanceof AppError) {
    console.error(`Code: ${error.code}`);
    console.error(`Status: ${error.statusCode}`);
    if (error.details) {
      console.error(`Details: ${JSON.stringify(error.details)}`);
    }
  }

  if (isDevelopment && error.stack) {
    console.error(`Stack: ${error.stack}`);
  }

  console.error('================\n');
}

/**
 * 全局错误处理中间件
 * 必须有4个参数，否则 Express 不会将其识别为错误处理中间件
 */
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 记录错误日志
  logError(error, req);

  // 如果响应已经发送，则交给 Express 默认错误处理器
  if (res.headersSent) {
    return next(error);
  }

  // 发送错误响应（开发环境包含堆栈信息）
  sendError(res, error, isDevelopment);
}

/**
 * 404 Not Found 处理中间件
 * 当没有路由匹配时调用
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    ErrorCode.NOT_FOUND,
    {
      method: req.method,
      url: req.originalUrl
    }
  );

  next(error);
}

/**
 * 异步路由处理器包装函数
 * 自动捕获异步错误并传递给错误处理中间件
 * @param fn 异步路由处理函数
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 未捕获的Promise拒绝处理
 */
process.on('unhandledRejection', (reason: Error | any) => {
  console.error('Unhandled Promise Rejection:');
  console.error(reason);

  // 在生产环境中，可以选择重启服务或发送告警
  if (!isDevelopment) {
    // TODO: 发送告警通知
    // 优雅关闭服务器
    // process.exit(1);
  }
});

/**
 * 未捕获的异常处理
 */
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:');
  console.error(error);

  // 未捕获的异常是严重错误，应该重启服务
  console.error('Shutting down due to uncaught exception...');
  process.exit(1);
});
