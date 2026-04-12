@echo off
cd /d "c:\Users\brzoz\OneDrive\Desktop\ALTIVOR"
start "ALTIVOR Server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8090/index.html"
