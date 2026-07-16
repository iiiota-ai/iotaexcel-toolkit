Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$outDir = Join-Path $root 'resources'
$outFile = Join-Path $outDir 'icon.png'
New-Item -ItemType Directory -Force $outDir | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

function Brush($r, $g, $b, $a = 255) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, $r, $g, $b))
}

function Pen($r, $g, $b, $width, $a = 255) {
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($a, $r, $g, $b)), $width
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $p
}

function RoundedPath($x, $y, $w, $h, $radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

$bgPath = RoundedPath 18 18 220 220 48
$bgGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle 0, 0, 256, 256),
  ([System.Drawing.Color]::FromArgb(10, 22, 48)),
  ([System.Drawing.Color]::FromArgb(66, 56, 180)),
  38
)
$graphics.FillPath($bgGradient, $bgPath)
$graphics.DrawPath((Pen 142 197 255 2 150), $bgPath)

$panelPath = RoundedPath 54 56 148 144 28
$panelGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle 54, 56, 148, 144),
  ([System.Drawing.Color]::FromArgb(245, 249, 255)),
  ([System.Drawing.Color]::FromArgb(206, 225, 255)),
  45
)
$graphics.FillPath($panelGradient, $panelPath)
$graphics.DrawPath((Pen 255 255 255 2 210), $panelPath)

$linePen = Pen 82 92 180 3 72
$graphics.DrawLine($linePen, 78, 92, 178, 92)
$graphics.DrawLine($linePen, 78, 128, 178, 128)
$graphics.DrawLine($linePen, 78, 164, 178, 164)
$graphics.DrawLine($linePen, 92, 78, 92, 178)
$graphics.DrawLine($linePen, 128, 78, 128, 178)
$graphics.DrawLine($linePen, 164, 78, 164, 178)

$accentPen = Pen 36 195 255 5 230
$graphics.DrawLine($accentPen, 68, 70, 104, 70)
$graphics.DrawLine($accentPen, 68, 70, 68, 106)
$graphics.DrawLine($accentPen, 152, 186, 188, 186)
$graphics.DrawLine($accentPen, 188, 150, 188, 186)

$font = New-Object System.Drawing.Font('Segoe UI Variable Display', 55, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fallbackFont = New-Object System.Drawing.Font('Segoe UI', 55, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = Brush 17 27 69
$textFormat = New-Object System.Drawing.StringFormat
$textFormat.Alignment = [System.Drawing.StringAlignment]::Center
$textFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF 54, 54, 148, 144
try {
  $graphics.DrawString('Ix', $font, $textBrush, $textRect, $textFormat)
} catch {
  $graphics.DrawString('Ix', $fallbackFont, $textBrush, $textRect, $textFormat)
}

$nodeBrush = Brush 255 255 255 235
$graphics.FillEllipse($nodeBrush, 63, 65, 10, 10)
$graphics.FillEllipse($nodeBrush, 183, 181, 10, 10)
$graphics.FillEllipse((Brush 36 195 255 235), 108, 66, 8, 8)
$graphics.FillEllipse((Brush 245 158 11 240), 144, 183, 8, 8)

$glowPen = Pen 99 102 241 1 95
$graphics.DrawEllipse($glowPen, 38, 38, 180, 180)
$graphics.DrawEllipse($glowPen, 28, 28, 200, 200)

$bitmap.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

$font.Dispose()
$fallbackFont.Dispose()
$textBrush.Dispose()
$textFormat.Dispose()
$nodeBrush.Dispose()
$bgGradient.Dispose()
$panelGradient.Dispose()
$bgPath.Dispose()
$panelPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Wrote $outFile"
