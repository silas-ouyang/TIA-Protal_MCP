@echo off
chcp 65001 >nul
title TIA MCP 网关 D - 安装
cd /d "%~dp0"
echo.
echo   正在用包内自带的 Node 运行安装脚本...
echo.
"%~dp0gateway\runtime\node.exe" "%~dp0install.js"
echo.
pause
