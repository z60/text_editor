<#
  文本编辑器 —— 系统托盘快捷启动
  ---------------------------------------------------------------
  在 Windows 右下角通知区域（「向上箭头」展开的隐藏图标区）放一个图标，
  双击即可启动服务并打开编辑器，不需要时右键退出。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1            启动托盘
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Open      只打开编辑器（不起托盘）
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Status    只看服务状态（不动进程）
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Install   安装开机自启
    powershell -NoProfile -ExecutionPolicy Bypass -File tray.ps1 -Uninstall 取消开机自启
#>
param(
  [switch]$Open,
  [switch]$Status,
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
$CheckPath = Join-Path $Root 'server-check.ps1'

# 端口探测 / 新旧代码判定都放在这个小模块里（它也能单独跑：-File server-check.ps1）
. $CheckPath -Root $Root
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
# Get-EditorUrl / Test-Server / Test-FreshServer / Find-RunningServer / Stop-StaleServer
# 都在 server-check.ps1 里（见文件开头的点源）。这里只管「起一个自己的服务」和菜单动作。

function Start-Server {
  $running = Find-RunningServer
  if ($running) { return $running }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    [System.Windows.Forms.MessageBox]::Show('未找到 Node.js，请先安装 Node.js 18 或更高版本。', $AppName) | Out-Null
    return $null
  }
  # 没找到可用的服务（可能刚把旧代码的服务换掉）：清掉可能指向旧端口的端口文件。
  # 不清的话，新服务换了端口后下面的等待循环会一直读旧端口，误报「启动失败」。
  try { Remove-Item -LiteralPath $PortFile -Force -ErrorAction SilentlyContinue } catch { }
  $env:NO_OPEN = '1'          # 由托盘负责打开浏览器，避免打开两次
  $script:ServerProc = Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 200
    $u = Get-EditorUrl
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
  # 不是托盘起的（比如上次开机自启留下的）也要能停掉
  $u = Get-EditorUrl
  if ((Test-Server $u) -and (Stop-StaleServer $u)) {
    $script:ServerProc = $null
    $tray.ShowBalloonTip(2500, $AppName, '编辑器服务已停止', 'Info')
    return
  }
  [System.Windows.Forms.MessageBox]::Show(
    '当前没有由托盘启动的服务。' + "`n" + '（如果服务是别的窗口启动的，关掉那个窗口即可）', $AppName) | Out-Null
}

function Open-Editor {
  $replaced = $false
  $url = Start-Server
  if ($url) {
    if (Test-StaleReplaced) { $replaced = $true }
    Start-Process $url
    if ($replaced -and $tray) {
      $tray.ShowBalloonTip(3000, $AppName, '发现正在跑的服务是改动前启动的旧代码，已自动换成当前代码的服务。', 'Info')
    }
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

if ($Status) {
  Show-ServerStatus
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
$miRestart = $menu.Items.Add('重启编辑器服务')
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
$miRestart.add_Click({
    # 改完代码（尤其 server.js / translate.js）后，用这个手动把服务换成当前代码
    try {
      $u = Get-EditorUrl
      if (Test-Server $u) { $null = Stop-StaleServer $u }
      $script:ServerProc = $null
      try { Remove-Item -LiteralPath $PortFile -Force -ErrorAction SilentlyContinue } catch { }
      $nurl = Start-Server
      if ($nurl) {
        $tray.ShowBalloonTip(3000, $AppName, "服务已重启：$nurl", 'Info')
      } else {
        [System.Windows.Forms.MessageBox]::Show('重启失败：服务没有在预期时间内就绪。' + "`n" +
          '可以在项目文件夹里双击「start-editor.bat」查看具体错误。', $AppName) | Out-Null
      }
    } catch {
      [System.Windows.Forms.MessageBox]::Show("重启服务失败：`n$($_.Exception.Message)", $AppName) | Out-Null
    }
  })
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
