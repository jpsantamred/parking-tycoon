param(
    [int]$Port = 8123,
    [string]$Root = "$PSScriptRoot\prototype"
)

# LAN server — listens on all interfaces so phones on same WiFi can connect.
# NOTE: needs admin OR a one-time `netsh http add urlacl url=http://+:8123/ user=Everyone` (run as admin).

$ErrorActionPreference = 'Continue'

# Pick up the machine's LAN IP so we can print it
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
       Select-Object -ExpandProperty IPAddress

$prefix = "http://+:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "" -ForegroundColor Red
    Write-Host "ERROR: no pude abrir $prefix" -ForegroundColor Red
    Write-Host "Esto pasa porque Windows requiere permiso para que un proceso no-admin escuche en todas las interfaces." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "ARREGLO (1 vez sola, ejecutar PowerShell como Administrador):" -ForegroundColor Cyan
    Write-Host "  netsh http add urlacl url=http://+:$Port/ user=Everyone" -ForegroundColor White
    Write-Host ""
    Write-Host "ALTERNATIVA mas simple: usa Python si lo tienes instalado:" -ForegroundColor Cyan
    Write-Host "  cd prototype" -ForegroundColor White
    Write-Host "  python -m http.server $Port --bind 0.0.0.0" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  PARKING TYCOON - LAN SERVER ACTIVO       ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Sirviendo: $Root" -ForegroundColor Gray
Write-Host ""
Write-Host "Desde tu CELULAR (mismo WiFi), abri en el browser:" -ForegroundColor Yellow
foreach ($ip in $ips) {
    Write-Host "  ► http://$($ip):$Port/" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Desde la PC: http://localhost:$Port/" -ForegroundColor Gray
Write-Host ""
Write-Host "Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

try {
    while ($listener.IsListening) {
        $context = $null
        try {
            $context = $listener.GetContext()
            $req = $context.Request
            $res = $context.Response

            $path = $req.Url.AbsolutePath
            if ($path -eq '/') { $path = '/index.html' }

            $file = Join-Path $Root $path.TrimStart('/')
            if (Test-Path $file -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($file).ToLower()
                $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $res.ContentType = $type
                $res.Headers['Cache-Control'] = 'no-store'
                $res.Headers['Access-Control-Allow-Origin'] = '*'
                $res.SendChunked = $false
                $res.ContentLength64 = $bytes.LongLength
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host ("[{0}] {1} {2} ({3} bytes)" -f $req.RemoteEndPoint.Address, $req.HttpMethod, $path, $bytes.Length) -ForegroundColor DarkGray
            } else {
                $res.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
                $res.ContentLength64 = $msg.LongLength
                $res.OutputStream.Write($msg, 0, $msg.Length)
                Write-Host ("[{0}] {1} -> 404" -f $req.RemoteEndPoint.Address, $path) -ForegroundColor DarkYellow
            }
        } catch {
            Write-Warning "Request error: $_"
        } finally {
            if ($context -and $context.Response) {
                try { $context.Response.Close() } catch {}
            }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
