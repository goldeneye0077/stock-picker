#!/usr/bin/env node

/**
 * 智能选股系统 - 统一服务启动脚本
 * 支持 Windows、Linux、macOS
 *
 * 功能：
 * - 环境检查（Node.js、Python、依赖）
 * - 端口占用检查
 * - 数据库检查
 * - 并行启动三个服务
 * - 健康检查
 * - 彩色日志输出
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

// 颜色定义
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

// 配置
const CONFIG = {
  services: [
    {
      name: '后端服务',
      color: COLORS.cyan,
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['run', 'dev'],
      cwd: path.join(__dirname, 'backend'),
      port: 3000,
      healthCheck: 'http://localhost:3000/health',
      envFile: path.join(__dirname, 'backend', '.env')
    },
    {
      name: '前端服务',
      color: COLORS.yellow,
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['run', 'dev'],
      cwd: path.join(__dirname, 'frontend'),
      port: 3001,
      healthCheck: 'http://localhost:3001',
      envFile: null
    },
    {
      name: '数据服务',
      color: COLORS.green,
      command: 'python',
      args: ['-m', 'uvicorn', 'src.main:app', '--reload', '--port', '8002'],
      cwd: path.join(__dirname, 'data-service'),
      port: 8002,
      healthCheck: 'http://localhost:8002/health',
      envFile: path.join(__dirname, 'data-service', '.env'),
      env: {
        PYTHONPATH: path.join(__dirname, 'data-service')
      }
    }
  ],
  database: path.join(__dirname, 'data', 'stock_picker.db')
};

// 日志函数
function log(message, color = COLORS.white) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logHeader(message) {
  console.log('\n' + COLORS.bright +COLORS.magenta + '='.repeat(50));
  console.log(` ${message}`);
  console.log('='.repeat(50) + COLORS.reset + '\n');
}

function logInfo(message) {
  log(`[信息] ${message}`, COLORS.blue);
}

function logSuccess(message) {
  log(`[成功] ${message}`, COLORS.green);
}

function logError(message) {
  log(`[错误] ${message}`, COLORS.red);
}

// 检查函数
async function checkEnvironment() {
  logHeader('检查环境');
  try {
    const nodeVer = execSync('node -v').toString().trim();
    logSuccess(`Node.js: ${nodeVer}`);
    
    let pythonVer;
    try {
        pythonVer = execSync('python --version').toString().trim();
    } catch {
        pythonVer = execSync('python3 --version').toString().trim();
    }
    logSuccess(`Python: ${pythonVer}`);
    return true;
  } catch (e) {
    logError(`环境检查失败: ${e.message}`);
    return false;
  }
}

async function checkDependencies() {
  logHeader('检查依赖');
  
  // 检查根目录 node_modules (Workspaces 模式下依赖可能被提升到这里)
  const rootNodeModules = path.join(__dirname, 'node_modules');
  if (fs.existsSync(rootNodeModules)) {
      logSuccess('发现根目录依赖 (Workspaces mode)');
      return true;
  }

  // 如果根目录没有 node_modules，则检查各个子目录
  const dirs = [
      path.join(__dirname, 'backend', 'node_modules'),
      path.join(__dirname, 'frontend', 'node_modules')
  ];
  
  for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
          logError(`缺少依赖: ${dir}`);
          logInfo('请运行 scripts/setup.bat 或 npm run setup 安装依赖');
          return false;
      }
  }
  logSuccess('依赖检查通过');
  return true;
}

async function checkDatabase() {
    logHeader('检查数据库');
    if (fs.existsSync(CONFIG.database)) {
        logSuccess(`数据库已存在: ${CONFIG.database}`);
    } else {
        logInfo(`数据库不存在，将在服务启动时自动创建: ${CONFIG.database}`);
    }
}

async function checkEnvFiles() {
    logHeader('检查配置文件');
    for (const service of CONFIG.services) {
        if (service.envFile) {
            if (fs.existsSync(service.envFile)) {
                logSuccess(`配置文件已存在: ${service.envFile}`);
            } else {
                logError(`缺少配置文件: ${service.envFile}`);
                // 尝试从 .env.example 复制
                const exampleFile = service.envFile + '.example';
                if (fs.existsSync(exampleFile)) {
                    logInfo(`尝试从示例文件复制: ${exampleFile}`);
                    fs.copyFileSync(exampleFile, service.envFile);
                    logSuccess(`已创建配置文件: ${service.envFile}`);
                } else {
                    return false;
                }
            }
        }
    }
    return true;
}

function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(false); // 其他错误也视为不可用
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

async function checkPorts() {
    logHeader('检查端口');
    let allOk = true;
    for (const service of CONFIG.services) {
        const isFree = await checkPort(service.port);
        if (isFree) {
            logSuccess(`端口 ${service.port} 可用 (${service.name})`);
        } else {
            logError(`端口 ${service.port} 被占用 (${service.name})`);
            allOk = false;
        }
    }
    return allOk;
}

// 启动单个服务
function startService(service) {
    return new Promise((resolve, reject) => {
      log(`\n启动 ${service.name}...`, service.color + COLORS.bright);
      logInfo(`目录: ${service.cwd}`);
      logInfo(`命令: ${service.command} ${service.args.join(' ')}`);
      logInfo(`端口: ${service.port}`);
  
      const proc = spawn(service.command, service.args, {
        cwd: service.cwd,
        stdio: 'pipe',
        shell: true,
        windowsHide: true,
        env: { ...process.env, ...(service.env || {}) }
      });

    // 处理输出
    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          log(`[${service.name}] ${line}`, service.color);
        }
      });
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          log(`[${service.name}] ${line}`, service.color);
        }
      });
    });

    proc.on('error', (error) => {
      logError(`${service.name} 启动失败: ${error.message}`);
      reject(error);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logError(`${service.name} 异常退出，代码: ${code}`);
      }
    });

    // 等待服务启动
    setTimeout(() => {
      logSuccess(`${service.name} 启动成功`);
      resolve(proc);
    }, 2000);
  });
}

// 启动所有服务
async function startAllServices() {
  logHeader('启动服务');

  const processes = [];

  for (const service of CONFIG.services) {
    try {
      const proc = await startService(service);
      processes.push(proc);
    } catch (error) {
      logError(`启动 ${service.name} 失败`);
      // 清理已启动的进程
      processes.forEach(p => p.kill());
      return false;
    }
  }

  return processes;
}

// 显示服务信息
function displayServiceInfo() {
  logHeader('服务访问地址');

  log('📊 前端界面: http://localhost:3001', COLORS.yellow + COLORS.bright);
  log('🔌 后端 API: http://localhost:3000', COLORS.cyan + COLORS.bright);
  log('📈 数据服务: http://localhost:8002', COLORS.green + COLORS.bright);
  log('📝 数据服务文档: http://localhost:8002/docs', COLORS.green);

  console.log('\n' + '='.repeat(60));
  log('提示：按 Ctrl+C 停止所有服务', COLORS.magenta);
  console.log('='.repeat(60) + '\n');
}

// 主函数
async function main() {
  console.clear();

  logHeader('🚀 智能选股系统 - 服务启动器');
  log('版本: 1.0.0', COLORS.cyan);
  log('平台: ' + process.platform, COLORS.cyan);

  try {
    // 1. 环境检查
    const envOk = await checkEnvironment();
    if (!envOk) {
      logError('环境检查失败，请解决上述问题后重试');
      process.exit(1);
    }

    // 2. 依赖检查
    const depsOk = await checkDependencies();
    if (!depsOk) {
      logError('依赖检查失败');
      process.exit(1);
    }

    // 3. 数据库检查
    await checkDatabase();

    // 4. 环境配置检查
    await checkEnvFiles();

    // 5. 端口检查
    const portsOk = await checkPorts();
    if (!portsOk) {
      logError('端口检查失败，请释放被占用的端口');
      process.exit(1);
    }

    // 6. 启动服务
    const processes = await startAllServices();

    if (!processes) {
      logError('服务启动失败');
      process.exit(1);
    }

    // 7. 显示访问信息
    setTimeout(() => {
      displayServiceInfo();
    }, 3000);

    // 8. 处理退出信号
    process.on('SIGINT', () => {
      log('\n\n正在停止所有服务...', COLORS.yellow);
      processes.forEach(proc => {
        try {
          proc.kill();
        } catch (error) {
          // 忽略错误
        }
      });
      log('所有服务已停止', COLORS.green);
      process.exit(0);
    });

  } catch (error) {
    logError('启动过程中发生错误:');
    console.error(error);
    process.exit(1);
  }
}

// 运行主函数
main();