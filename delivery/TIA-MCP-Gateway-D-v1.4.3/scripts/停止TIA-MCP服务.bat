@echo off
chcp 65001 >nul
title 停止 TIA Portal MCP
taskkill /IM tia-portal-mcp.exe /F >nul 2>&1
if errorlevel 1 (
  echo 没有正在运行的 TIA MCP 服务。
) else (
  echo 已停止。
)
timeout /t 2 >nul
