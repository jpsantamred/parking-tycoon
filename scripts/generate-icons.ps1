# Generates ParkingApp brand icons at every size the project needs:
#   * PWA / web icons in prototype/icons/
#   * Android launcher icons in android/app/src/main/res/mipmap-*/
#
# Design (matches assets/BRAND_LOGOS_README.md + the v0.87 splash logo):
#   - Orange (#f97316) rounded square background
#   - White bold P centered, Arial Black
#   - Border radius ~22% of side so it reads as a "soft" badge
#
# Run from project root:  pwsh -File scripts/generate-icons.ps1

param(
    [string]$ProjectRoot = "$PSScriptRoot\.."
)

Add-Type -AssemblyName System.Drawing

function New-ParkingIcon {
    param(
        [int]$Size,
        [string]$OutPath,
        [bool]$Round = $false,
        [bool]$Adaptive = $false        # adaptive icons need padding for safe zone
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    if ($Adaptive) {
        # Android adaptive icon foreground: 108x108 dp area, but only the inner
        # 72x72 dp is guaranteed visible (system masks the rest). Pad ~18%
        # all around so the P sits in the safe zone.
        $padding = [int]($Size * 0.18)
        $boxSize = $Size - ($padding * 2)
        $boxX = $padding
        $boxY = $padding
        # Adaptive foreground has TRANSPARENT background -- the orange box is
        # in the foreground layer too because we don't ship a separate
        # background.png. Drawn the same way.
    } else {
        $padding = 0
        $boxSize = $Size
        $boxX = 0
        $boxY = 0
    }

    $orange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 249, 115, 22))
    $white  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    if ($Round) {
        # Circular variant for ic_launcher_round on Android.
        $g.FillEllipse($orange, $boxX, $boxY, $boxSize, $boxSize)
    } else {
        # Rounded rectangle. GDI+ has no native rounded-rect, so build a path.
        $cornerR = [int]($boxSize * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc($boxX, $boxY, $cornerR*2, $cornerR*2, 180, 90)
        $path.AddArc($boxX + $boxSize - $cornerR*2, $boxY, $cornerR*2, $cornerR*2, 270, 90)
        $path.AddArc($boxX + $boxSize - $cornerR*2, $boxY + $boxSize - $cornerR*2, $cornerR*2, $cornerR*2, 0, 90)
        $path.AddArc($boxX, $boxY + $boxSize - $cornerR*2, $cornerR*2, $cornerR*2, 90, 90)
        $path.CloseFigure()
        $g.FillPath($orange, $path)
    }

    # Big white P centered. Arial Black scales nicely at all sizes.
    $fontSize = [int]($boxSize * 0.66)
    $font = New-Object System.Drawing.Font('Arial Black', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment     = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    # Nudge up a few % -- Arial Black descender weight makes the P look low-centered.
    $textRect = New-Object System.Drawing.RectangleF(
        [float]$boxX,
        [float]($boxY - $boxSize * 0.04),
        [float]$boxSize,
        [float]$boxSize)
    $g.DrawString('P', $font, $white, $textRect, $sf)

    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("  " + $Size + "x" + $Size + " -> " + $OutPath) -ForegroundColor Green
}

# -- PWA / web icons -----------------------------------------
$iconsDir = Join-Path $ProjectRoot 'prototype\icons'
if (Test-Path $iconsDir) {
    Write-Host "PWA icons:" -ForegroundColor Cyan
    New-ParkingIcon -Size 32  -OutPath (Join-Path $iconsDir 'favicon-32.png')
    New-ParkingIcon -Size 180 -OutPath (Join-Path $iconsDir 'apple-touch-icon.png')
    New-ParkingIcon -Size 192 -OutPath (Join-Path $iconsDir 'icon-192.png')
    New-ParkingIcon -Size 512 -OutPath (Join-Path $iconsDir 'icon-512.png')
} else {
    Write-Host "  (skip prototype/icons -- not found)" -ForegroundColor DarkGray
}

# -- Android launcher icons ----------------------------------
$mipmaps = @(
    @{ dir = 'mipmap-mdpi';    size = 48  },
    @{ dir = 'mipmap-hdpi';    size = 72  },
    @{ dir = 'mipmap-xhdpi';   size = 96  },
    @{ dir = 'mipmap-xxhdpi';  size = 144 },
    @{ dir = 'mipmap-xxxhdpi'; size = 192 }
)
$resDir = Join-Path $ProjectRoot 'android\app\src\main\res'
if (Test-Path $resDir) {
    Write-Host "Android launcher:" -ForegroundColor Cyan
    foreach ($entry in $mipmaps) {
        $dir = Join-Path $resDir $entry.dir
        if (Test-Path $dir) {
            New-ParkingIcon -Size $entry.size -OutPath (Join-Path $dir 'ic_launcher.png')
            New-ParkingIcon -Size $entry.size -OutPath (Join-Path $dir 'ic_launcher_round.png') -Round $true
            # Adaptive foreground: 108 dp at this density. mdpi=108, hdpi=162, etc.
            $adaptiveSize = [int]($entry.size * (108 / 48))
            New-ParkingIcon -Size $adaptiveSize -OutPath (Join-Path $dir 'ic_launcher_foreground.png') -Adaptive $true
        }
    }
} else {
    Write-Host "  (skip android/res -- not found)" -ForegroundColor DarkGray
}

Write-Host "Done. Rebuild the APK to see the new launcher icon." -ForegroundColor Cyan
