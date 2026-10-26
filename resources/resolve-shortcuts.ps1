param(
  [string]$Unused
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

$roots = @(
  [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonStartMenu),
  [Environment]::GetFolderPath([Environment+SpecialFolder]::StartMenu)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$shell = New-Object -ComObject WScript.Shell
$items = New-Object System.Collections.Generic.List[object]

foreach ($root in $roots) {
  Get-ChildItem -LiteralPath $root -Recurse -Filter *.lnk -File -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $shortcut = $shell.CreateShortcut($_.FullName)
      if (-not $shortcut.TargetPath) { return }
      $items.Add([pscustomobject]@{
        name = $_.BaseName
        shortcut = $_.FullName
        target = $shortcut.TargetPath
        args = $shortcut.Arguments
        workdir = $shortcut.WorkingDirectory
      })
    } catch {}
  }
}

ConvertTo-Json -InputObject @($items) -Compress -Depth 3
