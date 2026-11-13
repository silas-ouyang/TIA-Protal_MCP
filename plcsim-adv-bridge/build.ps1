param(
    [string]$OutDir = (Join-Path $PSScriptRoot "bin")
)

$ErrorActionPreference = "Stop"

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$plcSimApi = "C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\7.0\Siemens.Simatic.Simulation.Runtime.Api.x64.dll"
$sharp7 = "D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\upstreams\b\runtime\v20\Sharp7.dll"
$sysWebExt = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll"
$src = Join-Path $PSScriptRoot "src\PlcSimAdvBridge.cs"

if (-not (Test-Path $csc)) { throw "Missing x64 csc.exe at $csc" }
if (-not (Test-Path $plcSimApi)) { throw "Missing PLCSIM Advanced V7.0 API DLL at $plcSimApi" }
if (-not (Test-Path $sharp7)) { throw "Missing Sharp7.dll at $sharp7" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$outExe = Join-Path $OutDir "plcsim-adv-bridge.exe"

Copy-Item -Force $sharp7 (Join-Path $OutDir "Sharp7.dll")

& $csc /nologo /target:exe /platform:x64 /optimize+ `
    "/out:$outExe" `
    "/reference:$plcSimApi" `
    "/reference:$sharp7" `
    "/reference:$sysWebExt" `
    $src

if ($LASTEXITCODE -ne 0) {
    throw "csc compilation failed with exit code $LASTEXITCODE"
}

Write-Output "Built $outExe cleanly."
