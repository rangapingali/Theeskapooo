param(
  [Parameter(Mandatory=$true)][string]$Site,
  [Parameter(Mandatory=$true)][string]$SumatraExe,
  [string]$Printer = 'Brother HL-L2321D series'
)
$ErrorActionPreference = 'Stop'
$env:BRIDGE_SITE = $Site
$env:SUMATRA_EXE = (Resolve-Path -LiteralPath $SumatraExe).Path
$env:BRIDGE_PRINTER = $Printer
node (Join-Path $PSScriptRoot 'agent.cjs')
