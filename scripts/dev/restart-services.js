#!/usr/bin/env node

/**
 * 智能选股系统 - 统一服务重启脚本
 * 支持 Windows、Linux、macOS
 *
 * 功能：
 * - 先停止所有服务
 * - 等待清理完成
 * - 重新启动所有服务
 * - 彩色日志输出
 */

const { spawn } = require('child_process');
const path = require('path');

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

function logInfo(message) {
  log(`ℹ ${message}`, COLORS.cyan);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, COLORS.bright + COLORS.blue);
  console.log('='.repeat(60) + '\n');
}

// 运行脚本
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptName], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

// 主函数
async function main() {
  console.clear();

  logHeader('🔄 智能选股系统 - 服务重启器');
  log('版本: 1.0.0', COLORS.cyan);
  log('平台: ' + process.platform, COLORS.cyan);

  try {
    // 1. 停止所有服务
    logHeader('步骤 1/3: 停止现有服务');
    await runScript('stop-services.js');

    // 2. 等待一段时间确保进程完全清理
    logInfo('\n等待系统清理...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    logSuccess('系统清理完成');

    // 3. 启动所有服务
    logHeader('步骤 2/3: 启动服务');
    logInfo('即将启动所有服务...\n');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 启动服务（使用 spawn 保持运行）
    const startProc = spawn('node', ['start-services.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });

    // 处理退出
    process.on('SIGINT', () => {
      log('\n\n收到中断信号，正在停止服务...', COLORS.yellow);
      startProc.kill('SIGINT');
      process.exit(0);
    });

    startProc.on('close', (code) => {
      if (code !== 0) {
        logError(`服务异常退出，代码: ${code}`);
        process.exit(code);
      }
    });

  } catch (error) {
    logError('\n重启过程中发生错误:');
    console.error(error);

    console.log('\n' + '='.repeat(60));
    logError('服务重启失败');
    logInfo('建议手动检查并重试');
    console.log('='.repeat(60) + '\n');

    process.exit(1);
  }
}

// 运行主函数
main();
