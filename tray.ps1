<#
  文本编辑器 —— 系统托盘快捷启动
  ---------------------------------------------------------------
  在 Windows 右下角通知区域（「向上箭头」展开的隐藏图标区）放一个图标，
  双击即可启动服务并打开编辑器，不需要时右键退出。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1            启动托盘
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Open      只打开编辑器（不起托盘）
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Install   安装开机自启
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Uninstall 取消开机自启
#>
param(
  [switch]$Open,
  [switch]$Install,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try { [System.Windows.Forms.Application]::EnableVisualStyles() } catch { }

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $Root) { $Root = (Get-Location).Path }
Set-Location $Root

$PortFile = Join-Path $Root '.server-port'
$IconPath = Join-Path $Root 'icon.ico'
$VbsPath = Join-Path $Root 'start-tray.vbs'
# 快捷方式文件名必须用 ASCII：本机 ANSI 代码页是 932（日文），WScript.Shell
# 保存快捷方式时会把路径转成 ANSI，「编」字无法表示会变成「?」导致保存失败。
$LnkName = 'TextEditor.lnk'
$AppName = '文本编辑器'

# ---------- 生成图标文件（只在缺失时生成一次） ----------
function New-IconFile {
  if (Test-Path $IconPath) { return }
  try {
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    # 蓝色文档 + 白色纸面 + 灰色文字行
    $blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 42, 111, 191))
    $g.FillRectangle($blue, 4, 2, 24, 28)
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillRectangle($white, 7, 7, 18, 20)
    $gray = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 130, 150, 180))
    $g.FillRectangle($gray, 10, 11, 12, 2)
    $g.FillRectangle($gray, 10, 16, 12, 2)
    $g.FillRectangle($gray, 10, 21, 7, 2)
    $g.Dispose()
    $hIcon = $bmp.GetHicon()
    $ico = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = [System.IO.File]::Create($IconPath)
    $ico.Save($fs)
    $fs.Close()
    $bmp.Dispose()
  } catch {
    # 生成失败就用系统默认图标，不影响功能
  }
}

# ---------- 快捷方式 ----------
function Get-ShortcutPath([string]$folder) {
  return (Join-Path ([Environment]::GetFolderPath($folder)) $LnkName)
}

function New-Shortcut([string]$lnk) {
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $sc.Arguments = '"' + $VbsPath + '"'
  $sc.WorkingDirectory = $Root
  # 描述也保持 ASCII：WScript.Shell 存 .lnk 时按 ANSI(CP932) 转换，中文会变「?」
  $sc.Description = 'Text Editor (tray launcher)'
  if (Test-Path $IconPath) { $sc.IconLocation = $IconPath }
  $sc.Save()
}

function Set-AutoStart([bool]$on) {
  $lnk = Get-ShortcutPath 'Startup'
  if ($on) { New-Shortcut $lnk }
  elseif (Test-Path $lnk) { Remove-Item $lnk -Force }
}

# ---------- 服务端口 ----------
function Get-Url {
  if (Test-Path $PortFile) {
    $p = ''
    try { $p = (Get-Content $PortFile -Raw).Trim() } catch { $p = '' }
    if ($p -match '^\d+$') { return "http://127.0.0.1:$p/" }
  }
  return 'http://127.0.0.1:5173/'
}

function Test-Server([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

# 找已经在跑的服务：先看端口文件记的端口，再看默认端口 5173。
# 只看端口文件的话，文件过期（比如上次被强制结束后没清掉）就会误判成「没有服务」，
# 于是又起一个，机器上就并排躺着两个服务了。
function Find-RunningServer {
  $url = Get-Url
  if (Test-Server $url) { return $url }
  $fallback = 'http://127.0.0.1:5173/'
  if ($url -ne $fallback -and (Test-Server $fallback)) {
    try { Set-Content -Path $PortFile -Value '5173' -NoNewline -Encoding ascii } catch { }
    return $fallback
  }
  return ''
}

function Start-Server {
  $running = Find-RunningServer
  if ($running) { return $running }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    [System.Windows.Forms.MessageBox]::Show('未找到 Node.js，请先安装 Node.js 18 或更高版本。', $AppName) | Out-Null
    return $null
  }
  $env:NO_OPEN = '1'          # 由托盘负责打开浏览器，避免打开两次
  $script:ServerProc = Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 200
    $u = Get-Url
    if (Test-Server $u) { return $u }
  }
  return $null
}

function Stop-Server {
  if ($script:ServerProc -and -not $script:ServerProc.HasExited) {
    try {
      Stop-Process -Id $script:ServerProc.Id -Force
      $script:ServerProc = $null
      $tray.ShowBalloonTip(2500, $AppName, '编辑器服务已停止', 'Info')
      return
    } catch { }
  }
  [System.Windows.Forms.MessageBox]::Show(
    '当前没有由托盘启动的服务。' + "`n" + '（如果服务是别的窗口启动的，关掉那个窗口即可）', $AppName) | Out-Null
}

function Open-Editor {
  $url = Start-Server
  if ($url) {
    Start-Process $url
  } else {
    [System.Windows.Forms.MessageBox]::Show('启动失败：服务没有在预期时间内就绪。' + "`n" +
      '可以在项目文件夹里双击「start-editor.bat」查看具体错误。', $AppName) | Out-Null
  }
}

# ---------- 纯命令行模式 ----------
if ($Install -or $Uninstall) {
  New-IconFile
  Set-AutoStart ([bool]$Install)
  if ($Install) {
    Write-Host '已设置为开机自动启动（快捷方式已放入「启动」文件夹）。'
  } else {
    Write-Host '已取消开机自动启动。'
  }
  exit 0
}

if ($Open) {
  New-IconFile
  Open-Editor
  exit 0
}

# ---------- 单实例：已经有一个托盘图标就不再开第二个 ----------
$mutex = New-Object System.Threading.Mutex($false, 'Local\TextEditorTrayIcon')
$gotMutex = $false
try {
  $gotMutex = $mutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  # 上一次被强制结束时互斥体会变成「已遗弃」状态，这次直接接管
  $gotMutex = $true
} catch {
  $gotMutex = $true
}
if (-not $gotMutex) { exit 0 }

# ---------- 托盘图标与菜单 ----------
try {

New-IconFile

$tray = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $IconPath) {
  try { $tray.Icon = New-Object System.Drawing.Icon($IconPath) }
  catch { $tray.Icon = [System.Drawing.SystemIcons]::Application }
} else {
  $tray.Icon = [System.Drawing.SystemIcons]::Application
}
$tray.Text = "$AppName - 双击打开"

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add('打开文本编辑器')
$miStop = $menu.Items.Add('停止编辑器服务')
$miFolder = $menu.Items.Add('打开项目文件夹')
$null = $menu.Items.Add('-')
$miAuto = $menu.Items.Add('开机自动启动')
$miAuto.CheckOnClick = $true
$miAuto.Checked = (Test-Path (Get-ShortcutPath 'Startup'))
$miDesktop = $menu.Items.Add('创建桌面快捷方式')
$null = $menu.Items.Add('-')
$miExit = $menu.Items.Add('退出')

$miOpen.add_Click({ Open-Editor })
$miStop.add_Click({ Stop-Server })
$miFolder.add_Click({ Start-Process explorer.exe $Root })
$miAuto.add_Click({
    try {
      Set-AutoStart ([bool]$miAuto.Checked)
      if ($miAuto.Checked) { $tray.ShowBalloonTip(2500, $AppName, '已设置为开机自动启动', 'Info') }
    } catch {
      [System.Windows.Forms.MessageBox]::Show("设置开机自启动失败：`n$($_.Exception.Message)", $AppName) | Out-Null
    }
  })
$miDesktop.add_Click({
    try {
      New-Shortcut (Get-ShortcutPath 'Desktop')
      $tray.ShowBalloonTip(2500, $AppName, '桌面快捷方式已创建', 'Info')
    } catch {
      [System.Windows.Forms.MessageBox]::Show("创建快捷方式失败：`n$($_.Exception.Message)", $AppName) | Out-Null
    }
  })
$miExit.add_Click({
    $tray.Visible = $false
    $ctx.ExitThread()
  })
$tray.add_MouseDoubleClick({ Open-Editor })
$tray.ContextMenuStrip = $menu
$tray.Visible = $true

try {
  $tray.ShowBalloonTip(4000, $AppName,
    "已驻留托盘：双击图标打开编辑器，右键查看更多选项。`n（想让图标一直显示在任务栏上，可在「任务栏设置 → 选择哪些图标显示在任务栏上」里打开它）", 'Info')
} catch { }

$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)

$tray.Visible = $false
$tray.Dispose()
try { $mutex.ReleaseMutex() } catch { }

} catch {
  # 托盘启动失败时不能悄悄消失，留下日志并弹窗提示
  $msg = $_.Exception.ToString()
  # 日志文件名也保持 ASCII，避免 CP932 等非中文系统上的编码问题
  try { Set-Content -Path (Join-Path $Root 'tray-error.log') -Value $msg -Encoding UTF8 } catch { }
  try {
    [System.Windows.Forms.MessageBox]::Show(
      "托盘启动失败，详情见项目文件夹里的「tray-error.log」：`n`n$($_.Exception.Message)", $AppName) | Out-Null
  } catch { }
  exit 1
}
