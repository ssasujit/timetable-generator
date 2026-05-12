
$port = 8082
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server started at http://localhost:$port/"

$stateFile = Join-Path (Get-Location) "admin_state.json"
if (-not (Test-Path $stateFile)) {
    '{"usageLogs":[], "paymentRecords":{}, "adminIps":[], "paymentEnabled":true}' | Out-File $stateFile -Encoding utf8
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        
        # API Endpoints
        if ($path -eq "/api/state") {
            if ($request.HttpMethod -eq "GET") {
                $content = [System.IO.File]::ReadAllBytes($stateFile)
                $response.ContentType = "application/json"
            }
            elseif ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                $body | Out-File $stateFile -Encoding utf8
                $content = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok"}')
                $response.ContentType = "application/json"
            }
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        else {
            if ($path -eq "/") { $path = "/index.html" }
            $localPath = Join-Path (Get-Location) $path.Replace('/', '\').TrimStart('\')
            
            if (Test-Path $localPath -PathType Leaf) {
                $extension = [System.IO.Path]::GetExtension($localPath).ToLower()
                $contentType = switch ($extension) {
                    ".html" { "text/html" }
                    ".css"  { "text/css" }
                    ".js"   { "text/javascript" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".svg"  { "image/svg+xml" }
                    default { "application/octet-stream" }
                }
                
                $content = [System.IO.File]::ReadAllBytes($localPath)
                $response.ContentType = $contentType
                $response.ContentLength64 = $content.Length
                $response.OutputStream.Write($content, 0, $content.Length)
            } else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
