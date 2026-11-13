@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 停止 TIA Portal MCP
for %%I in ("%~dp0..") do set "PKG_ROOT=%%~fI"
set "TIA_GW_ROOT=%PKG_ROOT%"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $root=[IO.Path]::GetFullPath($env:TIA_GW_ROOT).TrimEnd('\')+'\'; $aDir=$root+'upstreams\a\'; $bDir=$root+'upstreams\b\'; $gwRt=$root+'gateway\runtime\'; $gwJs=$root+'gateway\gateway.js'; $killed=@(); foreach($p in (Get-CimInstance Win32_Process)){ $n=[string]$p.Name; $e=[string]$p.ExecutablePath; $c=[string]$p.CommandLine; $hit=($n -ieq 'tia-portal-mcp.exe' -and ($e.StartsWith($aDir,[StringComparison]::OrdinalIgnoreCase) -or $c.IndexOf($aDir,[StringComparison]::OrdinalIgnoreCase) -ge 0)) -or ($n -ieq 'TiaMcpServer.exe' -and ($e.StartsWith($bDir,[StringComparison]::OrdinalIgnoreCase) -or $c.IndexOf($bDir,[StringComparison]::OrdinalIgnoreCase) -ge 0)) -or ($n -ieq 'node.exe' -and ($e.StartsWith($gwRt,[StringComparison]::OrdinalIgnoreCase) -or $c.IndexOf($gwJs,[StringComparison]::OrdinalIgnoreCase) -ge 0) -and ($c -match '(?:^|[\s\x22\x27\\/])gateway\.js(?:[\s\x22\x27]|$)')); if($hit){ Stop-Process -Id $p.ProcessId -Force; $killed+=[int]$p.ProcessId; Write-Output ('已停止 ' + $n + ' (PID ' + $p.ProcessId + ')') } }; $lf=Join-Path $root 'gateway\runtime\active.lock'; if((Test-Path -LiteralPath $lf) -and $killed.Count -gt 0){ try{ $lo=Get-Content -LiteralPath $lf -Raw | ConvertFrom-Json; if($lo -and ($killed -contains [int]$lo.pid)){ Remove-Item -LiteralPath $lf -Force } }catch{} }; if($killed.Count -gt 0){ exit 0 }else{ exit 1 }"
if errorlevel 1 (
  echo 没有正在运行的本目录 TIA MCP 服务。
) else (
  echo 已停止本目录 TIA MCP 服务。
)
timeout /t 2 >nul 2>&1
