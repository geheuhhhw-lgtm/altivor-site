$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs'
$body = @{ email = "test$(Get-Random)@gmail.com"; password = 'TestPass123!' } | ConvertTo-Json
try {
    $r = Invoke-WebRequest -Uri 'https://lssedurdadjngqbchjbj.supabase.co/auth/v1/signup' -Method POST -Headers @{ 'apikey' = $key; 'Content-Type' = 'application/json' } -Body $body -UseBasicParsing
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY:"
    $r.Content
} catch {
    Write-Host "HTTP STATUS: $($_.Exception.Response.StatusCode.value__)"
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    Write-Host "RESPONSE BODY:"
    $reader.ReadToEnd()
}
