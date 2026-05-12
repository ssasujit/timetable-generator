
$port = 8082
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://*:$port/")
$listener.Start()
Write-Host "Server started at http://*:$port/"
Write-Host "IMPORTANT: Run as Administrator to allow network access."

$stateFile = Join-Path (Get-Location) "admin_state.json"
if (-not (Test-Path $stateFile)) {
    '{"usageLogs":[], "paymentRecords":{}, "adminIps":[], "paymentEnabled":true}' | Out-File $stateFile -Encoding utf8
}

# In-memory tracking of live users
$activeUsers = @{}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $ip = $request.RemoteEndPoint.Address.ToString()

        $path = $request.Url.LocalPath
        
        # API Endpoints
        if ($path -eq "/api/state") {
            if ($request.HttpMethod -eq "GET") {
                $stateContent = [System.IO.File]::ReadAllText($stateFile)
                
                # Cleanup old active users (older than 45s)
                $now = [DateTime]::Now
                $keysToRemove = $activeUsers.Keys | Where-Object { ($now - $activeUsers[$_].lastSeen).TotalSeconds -gt 45 }
                foreach ($k in $keysToRemove) { $activeUsers.Remove($k) }
                
                # Merge active users into response
                $activeList = @()
                foreach ($u in $activeUsers.Values) { $activeList += $u }
                
                $stateObj = $stateContent | ConvertFrom-Json
                $stateObj | Add-Member -MemberType NoteProperty -Name "activeUsers" -Value $activeList -Force
                
                $content = [System.Text.Encoding]::UTF8.GetBytes(($stateObj | ConvertTo-Json -Depth 10))
                $response.ContentType = "application/json"
            }
            elseif ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                # More robust write
                [System.IO.File]::WriteAllText($stateFile, $body)
                $content = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok"}')
                $response.ContentType = "application/json"
            }
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        elseif ($path -eq "/api/heartbeat") {
            if ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                $data = $body | ConvertFrom-Json
                
                $activeUsers[$ip] = @{
                    ip = $ip
                    school = $data.school
                    lastSeen = [DateTime]::Now
                    lastSeenStr = [DateTime]::Now.ToString("HH:mm:ss")
                }
                
                $content = [System.Text.Encoding]::UTF8.GetBytes('{"status":"alive"}')
                $response.ContentType = "application/json"
                $response.ContentLength64 = $content.Length
                $response.OutputStream.Write($content, 0, $content.Length)
            }
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

