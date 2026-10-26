param(
  [Parameter(Mandatory = $true)][int]$TargetPid,
  [Parameter(Mandatory = $true)][ValidateSet('info', 'close', 'focus')][string]$Action,
  [Parameter(Mandatory = $true)][long]$ExpectedCreatedMs
)

# The launcher passes the identity it verified from the process snapshot. This
# helper refuses to act when the process is gone or when the same PID now
# belongs to a different process (PID reuse), so a close request can never hit
# an unrelated program.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

function Write-Result {
  param([hashtable]$Result)
  $payload = [ordered]@{
    ok = [bool]$Result.ok
    handle = $Result.handle
    title = $Result.title
    reason = $Result.reason
  }
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
}

$target = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
if (-not $target) {
  Write-Result @{ ok = $false; reason = 'not-found' }
  exit 0
}

try {
  $created = [long]([DateTimeOffset]$target.StartTime).ToUnixTimeMilliseconds()
} catch {
  $created = 0
}

# Two seconds of tolerance covers the small difference between the WMI
# creation timestamp and Get-Process StartTime rounding.
if ($created -le 0 -or [Math]::Abs($created - $ExpectedCreatedMs) -gt 2000) {
  Write-Result @{ ok = $false; reason = 'identity-mismatch' }
  exit 0
}

$handle = [long]$target.MainWindowHandle
$title = [string]$target.MainWindowTitle

if ($Action -eq 'info') {
  if ($handle -eq 0) {
    Write-Result @{ ok = $false; handle = 0; title = $title; reason = 'no-window' }
  } else {
    Write-Result @{ ok = $true; handle = $handle; title = $title; reason = $null }
  }
  exit 0
}

if ($handle -eq 0) {
  Write-Result @{ ok = $false; handle = 0; title = $title; reason = 'no-window' }
  exit 0
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class PulseNativeWindow
{
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint attach, uint attachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();
}
"@

$window = [IntPtr]$handle

if ($Action -eq 'close') {
  # WM_CLOSE asks the application to shut down through its own window
  # procedure; nothing is terminated by force here.
  $sent = [PulseNativeWindow]::PostMessage($window, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  if ($sent) {
    Write-Result @{ ok = $true; handle = $handle; title = $title; reason = $null }
  } else {
    Write-Result @{ ok = $false; handle = $handle; title = $title; reason = 'post-failed' }
  }
  exit 0
}

# SW_RESTORE brings a minimized game back before focusing it.
[void][PulseNativeWindow]::ShowWindow($window, 9)

# Windows only lets the foreground process hand focus over. When the launcher
# itself is in front a plain call is enough; when the request comes from a
# gamepad shortcut (launcher in the background) we borrow the foreground
# thread's input queue for the switch, then detach again.
if (-not [PulseNativeWindow]::SetForegroundWindow($window)) {
  $foreground = [PulseNativeWindow]::GetForegroundWindow()
  $foregroundPid = [uint32]0
  $foregroundThread = [PulseNativeWindow]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  $currentThread = [PulseNativeWindow]::GetCurrentThreadId()
  $attached = $false

  if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
    $attached = [PulseNativeWindow]::AttachThreadInput($currentThread, $foregroundThread, $true)
  }

  try {
    [void][PulseNativeWindow]::BringWindowToTop($window)
    [void][PulseNativeWindow]::SetForegroundWindow($window)
  } finally {
    if ($attached) {
      [void][PulseNativeWindow]::AttachThreadInput($currentThread, $foregroundThread, $false)
    }
  }
}

if ([PulseNativeWindow]::GetForegroundWindow() -eq $window) {
  Write-Result @{ ok = $true; handle = $handle; title = $title; reason = $null }
} else {
  Write-Result @{ ok = $false; handle = $handle; title = $title; reason = 'foreground-denied' }
}
exit 0
