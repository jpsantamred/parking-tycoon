# Generates Android splash screen PNGs with the ParkingApp brand
# (orange + white P + "PARKING APP" + "powered by Redcomercio")
# Replaces the default Capacitor placeholder in all res/drawable-* dirs.

param(
    [string]$ResDir = "$PSScriptRoot\..\android\app\src\main\res"
)

Add-Type -AssemblyName System.Drawing

function New-ParkingAppSplash {
    param([int]$W, [int]$H, [string]$OutPath)
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    $g.FillRectangle($bg, 0, 0, $W, $H)

    $minDim = [Math]::Min($W, $H)
    $logoSize = [int]($minDim * 0.42)
    $logoX = ($W - $logoSize) / 2
    $logoY = ($H - $logoSize) / 2 - [int]($minDim * 0.08)
    $cornerR = [int]($logoSize * 0.18)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($logoX, $logoY, $cornerR*2, $cornerR*2, 180, 90)
    $path.AddArc($logoX + $logoSize - $cornerR*2, $logoY, $cornerR*2, $cornerR*2, 270, 90)
    $path.AddArc($logoX + $logoSize - $cornerR*2, $logoY + $logoSize - $cornerR*2, $cornerR*2, $cornerR*2, 0, 90)
    $path.AddArc($logoX, $logoY + $logoSize - $cornerR*2, $cornerR*2, $cornerR*2, 90, 90)
    $path.CloseFigure()

    $orangeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 249, 115, 22))
    $g.FillPath($orangeBrush, $path)

    $fontSize = [int]($logoSize * 0.72)
    $font = New-Object System.Drawing.Font('Arial Black', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF([float]$logoX, [float]($logoY - $logoSize * 0.04), [float]$logoSize, [float]$logoSize)
    $g.DrawString('P', $font, $whiteBrush, $textRect, $sf)

    $subFontSize = [int]($logoSize * 0.13)
    $subFont = New-Object System.Drawing.Font('Arial Black', $subFontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $subRect = New-Object System.Drawing.RectangleF([float]0, [float]($logoY + $logoSize + ($minDim * 0.02)), [float]$W, [float]($minDim * 0.1))
    $g.DrawString('PARKING APP', $subFont, $orangeBrush, $subRect, $sf)

    $tagFontSize = [int]($logoSize * 0.07)
    $tagFont = New-Object System.Drawing.Font('Arial', $tagFontSize, [System.Drawing.FontStyle]::Italic, [System.Drawing.GraphicsUnit]::Pixel)
    $tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 165, 243, 252))
    $tagRect = New-Object System.Drawing.RectangleF([float]0, [float]($logoY + $logoSize + ($minDim * 0.15)), [float]$W, [float]($minDim * 0.05))
    $g.DrawString('powered by Redcomercio', $tagFont, $tagBrush, $tagRect, $sf)

    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("  Wrote " + $W + "x" + $H + " -> " + $OutPath) -ForegroundColor Green
}

$sizes = @(
    @{ dir = 'drawable';                 w = 480;  h = 800 },
    @{ dir = 'drawable-port-mdpi';       w = 320;  h = 480 },
    @{ dir = 'drawable-port-hdpi';       w = 480;  h = 800 },
    @{ dir = 'drawable-port-xhdpi';      w = 720;  h = 1280 },
    @{ dir = 'drawable-port-xxhdpi';     w = 960;  h = 1600 },
    @{ dir = 'drawable-port-xxxhdpi';    w = 1280; h = 1920 },
    @{ dir = 'drawable-land-mdpi';       w = 480;  h = 320 },
    @{ dir = 'drawable-land-hdpi';       w = 800;  h = 480 },
    @{ dir = 'drawable-land-xhdpi';      w = 1280; h = 720 },
    @{ dir = 'drawable-land-xxhdpi';     w = 1600; h = 960 },
    @{ dir = 'drawable-land-xxxhdpi';    w = 1920; h = 1280 }
)

foreach ($entry in $sizes) {
    $target = Join-Path $ResDir ($entry.dir + '\splash.png')
    $parent = Split-Path $target -Parent
    if (Test-Path $parent) {
        New-ParkingAppSplash -W $entry.w -H $entry.h -OutPath $target
    } else {
        Write-Host ("  (skip " + $entry.dir + ") - directory missing") -ForegroundColor DarkGray
    }
}

Write-Host "Done. Rebuild the APK to see the new splash." -ForegroundColor Cyan
