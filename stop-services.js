#!/usr/bin/env node

/**
 * 智能选股系统 - 统一服务停止脚本
 * 支持 Windows、Linux、macOS
 *
 * 功能：
 * - 查找占用指定端口的进程
 * - 强制终止相关服务进程
 * - 清理后台进程
 * - 彩色日志输出
 */

const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 配置
const CONFIG = {
  services: [
    { name: '后端服务', port: 3000, processNames: ['node', 'ts-node', 'nodemon'] },
    { name: '前端服务', port: 3001, processNames: ['node', 'vite'] },
    { name: '数据服务', port: 8001, processNames: ['python', 'uvicorn'] }
  ]
};

// 颜色代码
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// 日志函数
function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, COLORS.green);
}

function logError(message) {
  log(`✗ ${message}`, COLORS.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, COLORS.yellow);
}

function logInfo(message) {
  log(`ℹ ${message}`, COLORS.cyan);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, COLORS.bright + COLORS.blue);
  console.log('='.repeat(60) + '\n');
}

// 查找占用端口的进程 ID (Windows)
async function findProcessByPortWindows(port) {
  try {
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
    const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));

    if (lines.length === 0) return null;

    const match = lines[0].match(/\s+(\d+)\s*$/);
    if (match) {
      return match[1];
    }
  } catch (error) {
    return null;
  }
  return null;
}

// 查找占用端口的进程 ID (Linux/Mac)
async function findProcessByPortUnix(port) {
  try {
    const { stdout } = await execPromise(`lsof -ti:${port}`);
    const pid = stdout.trim();
    return pid || null;
  } catch (error) {
    return null;
  }
}

// 查找占用端口的进程
async function findProcessByPort(port) {
  if (process.platform === 'win32') {
    return await findProcessByPortWindows(port);
  } else {
    return await findProcessByPortUnix(port);
  }
}

// 终止进程 (Windows)
async function killProcessWindows(pid) {
  try {
    await execPromise(`taskkill /PID ${pid} /F /T`);
    return true;
  } catch (error) {
    return false;
  }
}

// 终止进程 (Linux/Mac)
async function killProcessUnix(pid) {
  try {
    await execPromise(`kill -9 ${pid}`);
    return true;
  } catch (error) {
    return false;
  }
}

// 终止进程
async function killProcess(pid) {
  if (process.platform === 'win32') {
    return await killProcessWindows(pid);
  } else {
    return await killProcessUnix(pid);
  }
}

// 按进程名称查找并终止 (Windows)
async function killProcessByNameWindows(processName) {
  try {
    // 查找进程
    const { stdout } = await execPromise(`tasklist /FI "IMAGENAME eq ${processName}.exe" /FO CSV /NH`);

    if (stdout.includes(processName)) {
      // 终止所有匹配的进程
      await execPromise(`taskkill /IM ${processName}.exe /F /T`);
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

// 按进程名称查找并终止 (Linux/Mac)
async function killProcessByNameUnix(processName) {
  try {
    await execPromise(`pkill -9 ${processName}`);
    return true;
  } catch (error) {
    return false;
  }
}

// 停止单个服务
async function stopService(service) {
  log(`\n正在停止 ${service.name}...`, COLORS.yellow + COLORS.bright);

  let stopped = false;

  // 方法 1: 通过端口查找并停止
  logInfo(`检查端口 ${service.port}...`);
  const pid = await findProcessByPort(service.port);

  if (pid) {
    logInfo(`找到进程 PID: ${pid}`);
    const killed = await killProcess(pid);

    if (killed) {
      logSuccess(`已通过端口 ${service.port} 停止进程 ${pid}`);
      stopped = true;
    } else {
      logWarning(`无法停止进程 ${pid}`);
    }
  } else {
    logInfo(`端口 ${service.port} 未被占用`);
  }

  // 方法 2: 通过进程名称停止（作为备份）
  if (!stopped && process.platform === 'win32') {
    for (const processName of service.processNames) {
      const killed = await killProcessByNameWindows(processName);
      if (killed) {
        logSuccess(`已停止相关进程: ${processName}`);
        stopped = true;
      }
    }
  }

  if (!stopped) {
    logWarning(`${service.name} 可能未运行或已停止`);
  }
}

// 停止所有服务
async function stopAllServices() {
  logHeader('停止所有服务');

  for (const service of CONFIG.services) {
    await stopService(service);
  }

  // 额外清理：强制终止所有 node 和 python 进程（可选，谨慎使用）
  // 如果上述方法没有完全清理，可以取消注释下面的代码
  /*
  if (process.platform === 'win32') {
    logInfo('\n执行额外清理...');
    try {
      await execPromise('taskkill /F /IM node.exe /T 2>nul');
      await execPromise('taskkill /F /IM python.exe /T 2>nul');
      logSuccess('额外清理完成');
    } catch (error) {
      // 忽略错误
    }
  }
  */
}

// 验证服务已停止
async function verifyServicesStopped() {
  logHeader('验证服务状态');

  let allStopped = true;

  for (const service of CONFIG.services) {
    const pid = await findProcessByPort(service.port);

    if (pid) {
      logWarning(`${service.name} (端口 ${service.port}) 仍在运行 (PID: ${pid})`);
      allStopped = false;
    } else {
      logSuccess(`${service.name} (端口 ${service.port}) 已停止`);
    }
  }

  return allStopped;
}

// 主函数
async function main() {
  console.clear();

  logHeader('🛑 智能选股系统 - 服务停止器');
  log('版本: 1.0.0', COLORS.cyan);
  log('平台: ' + process.platform, COLORS.cyan);

  try {
    // 1. 停止所有服务
    await stopAllServices();

    // 2. 等待进程完全终止
    logInfo('\n等待进程终止...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. 验证服务已停止
    const allStopped = await verifyServicesStopped();

    // 4. 显示结果
    console.log('\n' + '='.repeat(60));
    if (allStopped) {
      logSuccess('所有服务已成功停止');
    } else {
      logWarning('部分服务可能仍在运行，请手动检查');
      logInfo('提示：可以在任务管理器中手动结束相关进程');
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logError('停止过程中发生错误:');
    console.error(error);
    process.exit(1);
  }
}

// 运行主函数
main();
