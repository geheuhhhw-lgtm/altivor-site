$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs'

function Test-Endpoint($name, $url, $body) {
    Write-Host "`n=== $name ===" -ForegroundColor Cyan
    Write-Host "URL: $url"
    Write-Host "BODY: $body"
    try {
        $r = Invoke-WebRequest -Uri $url -Method POST -Headers @{ 'apikey' = $key; 'Content-Type' = 'application/json' } -Body $body -UseBasicParsing
        Write-Host "STATUS: $($r.StatusCode)" -ForegroundColor Green
        Write-Host "BODY: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
    } catch {
        Write-Host "STATUS: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        $s = $_.Exception.Response.GetResponseStream(); $r2 = New-Object System.IO.StreamReader($s); $r2.BaseStream.Position = 0; $r2.DiscardBufferedData()
        Write-Host "RESPONSE: $($r2.ReadToEnd())"
    }
}

# Empty password signup
Test-Endpoint "SIGNUP empty pw" 'https://lssedurdadjngqbchjbj.supabase.co/auth/v1/signup' (@{ email = "nope$(Get-Random)@gmail.com"; password = '' } | ConvertTo-Json)
# Empty password login
Test-Endpoint "LOGIN empty pw" 'https://lssedurdadjngqbchjbj.supabase.co/auth/v1/token?grant_type=password' (@{ email = "any@gmail.com"; password = '' } | ConvertTo-Json)
# Empty everything
Test-Endpoint "SIGNUP empty all" 'https://lssedurdadjngqbchjbj.supabase.co/auth/v1/signup' (@{ } | ConvertTo-Json)
