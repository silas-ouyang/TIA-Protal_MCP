@echo off
chcp 65001 >nul
title TIA Portal MCP 服务 (127.0.0.1:8000)
cd /d "%~dp0..\upstreams\a"
echo ============================================
echo   TIA Portal MCP  v1.4.1
echo   接口: http://127.0.0.1:8000/mcp
echo   关闭此窗口即停止服务
echo ============================================
echo.
"%~dp0..\upstreams\a\tia-portal-mcp.exe"
echo.
echo 服务已退出，按任意键关闭...
pause >nul
