param(
    [int]$Port = 8123,
    [string]$Root = "$PSScriptRoot\prototype"
)

$ErrorActionPreference = 'Continue'

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $Root at $prefix"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
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
                $res.SendChunked = $false
                $res.ContentLength64 = $bytes.LongLength
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host ("{0} {1} -> {2} ({3} bytes)" -f $req.HttpMethod, $path, $type, $bytes.Length)
            } else {
                $res.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
                $res.ContentLength64 = $msg.LongLength
                $res.OutputStream.Write($msg, 0, $msg.Length)
                Write-Host ("{0} {1} -> 404" -f $req.HttpMethod, $path)
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
