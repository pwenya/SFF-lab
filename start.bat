@echo off
echo  SFF Lab — Local Dev Server
echo ================================
where npx >nul 2>&1
if %errorlevel%==0 (
    echo  Using Node.js ^(npx serve^)...
    echo  Open: http://localhost:3000
    echo.
    npx serve . -p 3000
    goto :end
)
where python >nul 2>&1
if %errorlevel%==0 (
    echo  Using Python HTTP server...
    echo  Open: http://localhost:3000
    echo.
    python -m http.server 3000
    goto :end
)
echo  ERROR: Install Node.js or Python to use this server.
echo  Download Node.js: https://nodejs.org
pause
:end