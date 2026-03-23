$ngrok = "C:\Users\bccbo\Downloads\ngrok-v3-stable-windows-amd64\ngrok.exe"
Start-Process -FilePath $ngrok -ArgumentList "http 3001" -WindowStyle Minimized
Start-Sleep -Seconds 5
try {
    $r = Invoke-WebRequest "http://localhost:4040/api/tunnels" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $json = $r.Content | ConvertFrom-Json
    foreach ($tunnel in $json.tunnels) {
        if ($tunnel.proto -eq "https") {
            $url = $tunnel.public_url
            Write-Host ("NGROK_URL: " + $url)
            Write-Host ""
            Write-Host ("Webhook URL: " + $url + "/api/line/webhook")
        }
    }
} catch {
    Write-Host "ngrok API not ready — check if ngrok started correctly"
    Write-Host "Open: http://localhost:4040"
}
