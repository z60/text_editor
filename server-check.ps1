<#
  文本编辑器 —— 服务健康检查 / 自动换新
  ---------------------------------------------------------------
  为什么需要它：
    静态文件（index.html、js/*.js、css）是每次请求现读磁盘的，所以改了前端只要刷新页面就是新的；
    但「翻译接口」这类后端能力是 node 进程启动时载入的。托盘启动编辑器时会**复用已经在跑的服务**，
    如果那个进程是改动代码之前启动的，就会出现「前端是新的、后端接口是旧的」这种半新半旧状态
    （典型症状：Ctrl+Shift+空格 提示本地服务没有翻译接口，而 start-editor.bat 起的新服务却正常）。

  做法：
    1. server.js 通过 GET /api/version 自报家门（app / pid / startedAt / node / port）；
    2. 这里拿 startedAt 和 server.js、translate.js 的修改时间比：
       任何一个后端文件的修改时间晚于服务启动时间 → 这个服务在跑旧代码；
    3. 确认端口上确实是本项目的页面（index.html 里有 id="toolbar"）且占用者是 node 之后，
       才把它停掉，再让托盘起一个新的。

  单独运行 = 只做诊断，不动任何进程：
    powershell -NoProfile -ExecutionPolicy Bypass -File server-check.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File server-check.ps1 -Root D:\path\to\text_editor
#>
param(
  [string]$Root = ''
)

if (-not $Root) { $Root = (Get-Location).Path }
try { $Root = (Resolve-Path -LiteralPath $Root).Path } catch { }

$script:EditorRoot = $Root
$script:PortFile = Join-Path $Root '.server-port'
$script:AppId = 'sakura-like-editor'
# 进程里载入的、改了就必须重启服务的文件（改了这里的列表，要换个思路：这两个文件是后端代码）
$script:BackendFiles = @('server.js', 'translate.js')
$script:StaleReplaced = $false

function Get-EditorRoot { return $script:EditorRoot }

function Get-EditorUrl {
  if (Test-Path -LiteralPath $script:PortFile) {
    $p = ''
    try { $p = (Get-Content -LiteralPath $script:PortFile -Raw).Trim() } catch { $p = '' }
    if ($p -match '^\d+$') { return "http://127.0.0.1:$p/" }
  }
  return 'http://127.0.0.1:5173/'
}

function Test-Server([string]$Url) {
  try { return ((Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) }
  catch { return $false }
}

function Get-ServerInfo([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri ($Url.TrimEnd('/') + '/api/version') -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -ne 200) { return $null }
    return ($r.Content | ConvertFrom-Json)
  } catch { return $null }
}

function Test-EditorPage([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -ne 200) { return $false }
    return ([string]$r.Content -match 'id="toolbar"')
  } catch { return $false }
}

# 端口上那个服务跑的是不是当前磁盘上的后端代码
function Test-FreshServer([string]$Url) {
  $info = Get-ServerInfo $Url
  if (-not $info) { return $false }                      # 连自述接口都没有 → 肯定是旧代码
  if ([string]$info.app -ne $script:AppId) { return $false }
  $startedUtc = $null
  try {
    $startedUtc = [datetime]::Parse([string]$info.startedAt,
      [System.Globalization.CultureInfo]::InvariantCulture,
      [System.Globalization.DateTimeStyles]::AdjustToUniversal)
  } catch { }
  if (-not $startedUtc) { return $false }
  # 同一秒内的写入不算过期（避免刚启动就被判成旧代码来回重启）
  $deadline = $startedUtc.AddSeconds(1)
  foreach ($f in $script:BackendFiles) {
    $p = Join-Path $script:EditorRoot $f
    if (-not (Test-Path -LiteralPath $p)) { continue }
    if ((Get-Item -LiteralPath $p).LastWriteTimeUtc -gt $deadline) { return $false }
  }
  return $true
}

function Get-ListenerPid([int]$Port) {
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
  } catch { }
  try {
    $line = netstat -ano | Select-String -Pattern (':' + $Port + '\s+.*LISTENING') | Select-Object -First 1
    if ($line -and ($line.Line -match '(\d+)\s*$')) { return [int]$Matches[1] }
  } catch { }
  return 0
}

# 只停「确认是本项目页面 + 占用者是 node」的服务，别的程序一律不碰
function Stop-StaleServer([string]$Url) {
  if (-not (Test-EditorPage $Url)) { return $false }
  $portNo = 0
  try { $portNo = ([Uri]$Url).Port } catch { return $false }
  if (-not $portNo) { return $false }
  $ownerId = Get-ListenerPid $portNo
  if (-not $ownerId) { return $false }
  $proc = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
  if (-not $proc -or $proc.ProcessName -ne 'node') { return $false }
  try {
    Stop-Process -Id $ownerId -Force
    Start-Sleep -Milliseconds 400
    $script:StaleReplaced = $true
    try { Remove-Item -LiteralPath $script:PortFile -Force -ErrorAction SilentlyContinue } catch { }
    return $true
  } catch { return $false }
}

function Test-StaleReplaced { return $script:StaleReplaced }

# 找可以直接用的服务；发现是旧代码的服务就地换掉（随后调用方会起一个新的）
function Find-RunningServer {
  $url = Get-EditorUrl
  if (Test-Server $url) {
    if (Test-FreshServer $url) { return $url }
    $null = Stop-StaleServer $url
  }
  $fallback = 'http://127.0.0.1:5173/'
  if ($url -ne $fallback -and (Test-Server $fallback)) {
    if (Test-FreshServer $fallback) {
      try { Set-Content -Path $script:PortFile -Value '5173' -NoNewline -Encoding ascii } catch { }
      return $fallback
    }
    $null = Stop-StaleServer $fallback
  }
  return ''
}

# ---------- 诊断输出（单独运行、或 tray.ps1 -Status 都走这里） ----------
function Show-ServerStatus {
  $url = Get-EditorUrl
  Write-Host "项目目录  : $script:EditorRoot"
  Write-Host "端口文件  : $script:PortFile"
  Write-Host "当前地址  : $url"
  if (-not (Test-Server $url)) {
    Write-Host '服务状态  : 没有服务在跑（下次打开时会起一个新的）'
    return
  }
  $info = Get-ServerInfo $url
  $ownerId = Get-ListenerPid ([Uri]$url).Port
  Write-Host "服务状态  : 有服务在跑（pid=$ownerId）"
  if (-not $info) {
    Write-Host '服务版本  : 取不到 /api/version —— 这是改动前启动的旧代码'
  } else {
    Write-Host ("服务版本  : app={0} node={1} 启动于 {2}" -f $info.app, $info.node, $info.startedAt)
  }
  foreach ($f in $script:BackendFiles) {
    $p = Join-Path $script:EditorRoot $f
    if (Test-Path -LiteralPath $p) {
      Write-Host ("磁盘文件  : {0} 最后修改 {1}" -f $f, (Get-Item -LiteralPath $p).LastWriteTime)
    }
  }
  if (Test-FreshServer $url) {
    Write-Host '结论      : 服务跑的就是当前代码，可以直接用'
  } else {
    Write-Host '结论      : 【旧代码】重新打开编辑器（托盘图标双击 / 右键「重启编辑器服务」）会自动换成新的'
  }
}

# ---------- 单独运行：只诊断，不动进程 ----------
if ($MyInvocation.InvocationName -ne '.') {
  Show-ServerStatus
  exit 0
}
