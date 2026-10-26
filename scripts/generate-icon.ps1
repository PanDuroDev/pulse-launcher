param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\build\icon.ico')
)

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @()

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $inset = [Math]::Max(0.5, $size * 0.035)
  $radius = $size * 0.24
  $rect = New-Object System.Drawing.RectangleF(
    [single]$inset,
    [single]$inset,
    [single]($size - ($inset * 2)),
    [single]($size - ($inset * 2))
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 24, 19, 38),
    [System.Drawing.Color]::FromArgb(255, 7, 7, 12),
    60
  )
  $g.FillPath($bg, $path)

  $rim = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::FromArgb(70, 255, 255, 255),
    [single][Math]::Max(0.5, $size * 0.012)
  )
  $g.DrawPath($rim, $path)

  $points = @(
    (New-Object System.Drawing.PointF([single]($size * 0.13), [single]($size * 0.54))),
    (New-Object System.Drawing.PointF([single]($size * 0.30), [single]($size * 0.54))),
    (New-Object System.Drawing.PointF([single]($size * 0.38), [single]($size * 0.29))),
    (New-Object System.Drawing.PointF([single]($size * 0.47), [single]($size * 0.75))),
    (New-Object System.Drawing.PointF([single]($size * 0.56), [single]($size * 0.43))),
    (New-Object System.Drawing.PointF([single]($size * 0.63), [single]($size * 0.54))),
    (New-Object System.Drawing.PointF([single]($size * 0.87), [single]($size * 0.54)))
  )

  $glowOuter = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::FromArgb(45, 255, 45, 117),
    [single][Math]::Max(2.0, $size * 0.13)
  )
  $glowOuter.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glowOuter.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glowOuter.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLines($glowOuter, $points)

  $glowMid = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::FromArgb(100, 255, 45, 117),
    [single][Math]::Max(1.2, $size * 0.065)
  )
  $glowMid.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glowMid.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glowMid.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLines($glowMid, $points)

  $lineBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, ($size * 0.5))),
    (New-Object System.Drawing.PointF($size, ($size * 0.5))),
    [System.Drawing.Color]::FromArgb(255, 255, 92, 158),
    [System.Drawing.Color]::FromArgb(255, 167, 139, 250)
  )
  $line = New-Object System.Drawing.Pen(
    $lineBrush,
    [single][Math]::Max(0.9, $size * 0.028)
  )
  $line.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $line.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLines($line, $points)

  $stream = New-Object System.IO.MemoryStream
  $bmp.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += [pscustomobject]@{ Size = $size; Bytes = $stream.ToArray() }

  $stream.Dispose()
  $line.Dispose()
  $lineBrush.Dispose()
  $glowMid.Dispose()
  $glowOuter.Dispose()
  $rim.Dispose()
  $bg.Dispose()
  $path.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$file = [System.IO.File]::Create($OutputPath)
$writer = New-Object System.IO.BinaryWriter($file)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$pngs.Count)

$offset = 6 + (16 * $pngs.Count)
foreach ($png in $pngs) {
  $dimension = if ($png.Size -ge 256) { 0 } else { $png.Size }
  $writer.Write([byte]$dimension)
  $writer.Write([byte]$dimension)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$png.Bytes.Length)
  $writer.Write([uint32]$offset)
  $offset += $png.Bytes.Length
}

foreach ($png in $pngs) {
  $writer.Write($png.Bytes)
}

$writer.Flush()
$writer.Dispose()
$file.Dispose()

Write-Output "Wrote $OutputPath"
