@echo off
setlocal
if "%QUOTIER_WINDOWS_CERT_SHA1%"=="" (
  echo QUOTIER_WINDOWS_CERT_SHA1 is required for a release build.
  exit /b 2
)
if "%QUOTIER_WINDOWS_TIMESTAMP_URL%"=="" set "QUOTIER_WINDOWS_TIMESTAMP_URL=http://timestamp.digicert.com"
signtool sign /sha1 "%QUOTIER_WINDOWS_CERT_SHA1%" /fd SHA256 /tr "%QUOTIER_WINDOWS_TIMESTAMP_URL%" /td SHA256 "%~1"
if errorlevel 1 exit /b %errorlevel%
signtool verify /pa /all /v "%~1"
