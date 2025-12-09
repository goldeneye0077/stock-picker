# 1. 强制关闭 Docker 相关进程
Write-Host "正在关闭卡死的 Docker 进程..." -ForegroundColor Yellow
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "com.docker.backend" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "com.docker.service" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# 2. 启动 Docker Desktop
Write-Host "正在启动 Docker Desktop..." -ForegroundColor Cyan
$dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerPath) {
    Start-Process $dockerPath
} else {
    Write-Error "未找到 Docker Desktop，请确认安装路径。"
    exit 1
}

# 3. 等待 Docker 就绪 (最多 180秒)
$dockerCli = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$timeout = 180
$elapsed = 0
$ready = $false

Write-Host "正在等待 Docker 引擎就绪 (可能需要几分钟)..." -ForegroundColor Cyan

while ($elapsed -lt $timeout) {
    # 尝试运行 docker info
    & $dockerCli info > $null 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        Write-Host "`nDocker 已就绪！" -ForegroundColor Green
        break
    }
    
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 5
    $elapsed += 5
}

if (-not $ready) {
    Write-Host "`nDocker 启动超时，请手动检查 Docker Desktop 状态。" -ForegroundColor Red
    exit 1
}

# 4. 使用 Docker Compose 启动服务
Write-Host "正在构建并启动服务..." -ForegroundColor Cyan
& $dockerCli compose down
& $dockerCli compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n所有服务已通过 Docker 成功启动！" -ForegroundColor Green
    Write-Host "前端访问地址: http://localhost:3101" -ForegroundColor White
    Write-Host "后端 API 地址: http://localhost:3100" -ForegroundColor White
} else {
    Write-Host "`n服务启动失败，请检查 Docker Compose 配置。" -ForegroundColor Red
}
