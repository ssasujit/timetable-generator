$port = 8082
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://*:$port/")
$listener.Start()
Write-Host "--- MasterGrid Server Started ---" -ForegroundColor Green
Write-Host "Port: $port"
Write-Host "URL: http://*:$port/"
Write-Host "IMPORTANT: Run as Administrator for network access."

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
        
        Write-Host "$(Get-Date -Format 'HH:mm:ss') | $ip | $($request.HttpMethod) | $path" -ForegroundColor Gray

        # API Endpoints
        if ($path -eq "/api/state") {
            if ($request.HttpMethod -eq "GET") {
                try {
                    $stateContent = [System.IO.File]::ReadAllText($stateFile)
                    $stateObj = $stateContent | ConvertFrom-Json
                    
                    # Cleanup old active users (older than 45s)
                    $now = [DateTime]::Now
                    $keysToRemove = $activeUsers.Keys | Where-Object { ($now - $activeUsers[$_].lastSeen).TotalSeconds -gt 45 }
                    foreach ($k in $keysToRemove) { $activeUsers.Remove($k) }
                    
                    # Merge active users and reporter IP
                    $activeList = @()
                    foreach ($u in $activeUsers.Values) { $activeList += $u }
                    
                    $stateObj | Add-Member -MemberType NoteProperty -Name "activeUsers" -Value $activeList -Force
                    $stateObj | Add-Member -MemberType NoteProperty -Name "yourIp" -Value $ip -Force
                    
                    $jsonResponse = $stateObj | ConvertTo-Json -Depth 10
                    $content = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                    $response.ContentType = "application/json"
                } catch {
                    Write-Host "Error processing /api/state GET: $_" -ForegroundColor Red
                    $content = [System.Text.Encoding]::UTF8.GetBytes('{"error":"server error"}')
                    $response.StatusCode = 500
                }
            }
            elseif ($request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream)
                    $body = $reader.ReadToEnd()
                    if (-not [string]::IsNullOrWhiteSpace($body)) {
                        [System.IO.File]::WriteAllText($stateFile, $body)
                        Write-Host "State updated successfully." -ForegroundColor Cyan
                    }
                    $content = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok", "yourIp":"' + $ip + '"}')
                    $response.ContentType = "application/json"
                } catch {
                    Write-Host "Error processing /api/state POST: $_" -ForegroundColor Red
                    $content = [System.Text.Encoding]::UTF8.GetBytes('{"error":"save failed"}')
                    $response.StatusCode = 500
                }
            }
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        elseif ($path -eq "/api/heartbeat") {
            if ($request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream)
                    $body = $reader.ReadToEnd()
                    $data = $body | ConvertFrom-Json
                    
                    $schoolName = if ($data.school) { $data.school } else { "Guest" }
                    $userKey = $ip + "_" + $schoolName
                    
                    $activeUsers[$userKey] = @{
                        ip = $ip
                        school = $schoolName
                        lastSeen = [DateTime]::Now
                        lastSeenStr = [DateTime]::Now.ToString("HH:mm:ss")
                    }
                    
                    $content = [System.Text.Encoding]::UTF8.GetBytes('{"status":"alive", "yourIp":"' + $ip + '"}')
                    $response.ContentType = "application/json"
                    $response.ContentLength64 = $content.Length
                    $response.OutputStream.Write($content, 0, $content.Length)
                } catch {
                    Write-Host "Error processing heartbeat: $_" -ForegroundColor Yellow
                }
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

