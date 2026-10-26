param(
  [int]$ParentPid,
  [int]$IntervalMs = 2500
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'

while ($true) {
  if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) {
    break
  }

  $items = @(Get-CimInstance Win32_Process -Property ProcessId, Name, ExecutablePath, CreationDate | ForEach-Object {
    [pscustomobject]@{
      id = [int]$_.ProcessId
      name = [string]$_.Name
      path = if ($_.ExecutablePath) { [string]$_.ExecutablePath } else { $null }
      # Creation time lets the launcher detect a reused PID after the process
      # exits, instead of acting on whichever process inherited the number.
      startedAt = if ($_.CreationDate) { [long]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }
    }
  })

  if ($items.Count -eq 0) {
    [Console]::Out.WriteLine('[]')
  } else {
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $items -Compress -Depth 2))
  }
  [Console]::Out.Flush()

  Start-Sleep -Milliseconds $IntervalMs
}
