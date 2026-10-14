$ErrorActionPreference='Stop'
try {
  $project=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  Set-Location -LiteralPath $project
  if(!(Get-Command node -ErrorAction SilentlyContinue)){throw 'Install Node.js 22 or 24 from nodejs.org, then reopen this launcher.'}
  $printers=@(Get-Printer | Where-Object {$_.Name -match 'Brother.*HL.?L2321D'})
  if($printers.Count -eq 0){throw 'Install the official Brother HL-L2321D Windows driver, connect USB, and print a Windows test page first.'}
  $printer=$printers[0].Name
  if($printers.Count -gt 1){for($i=0;$i -lt $printers.Count;$i++){Write-Host "$($i+1). $($printers[$i].Name)"};$choice=Read-Host 'Choose printer number';if($choice -notmatch '^\d+$' -or [int]$choice -lt 1 -or [int]$choice -gt $printers.Count){throw 'Invalid printer selection'};$printer=$printers[[int]$choice-1].Name}
  $candidates=@((Join-Path $env:ProgramFiles 'SumatraPDF\SumatraPDF.exe'),(Join-Path $env:LOCALAPPDATA 'SumatraPDF\SumatraPDF.exe'))
  $sumatra=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
  if(!$sumatra){$sumatra=Read-Host 'Enter the full path to your official SumatraPDF.exe installation'}
  if(!(Test-Path -LiteralPath $sumatra) -or [IO.Path]::GetFileName($sumatra) -ne 'SumatraPDF.exe'){throw 'Install SumatraPDF from sumatrapdfreader.org first.'}
  if(!(Test-Path -LiteralPath 'node_modules\pdf-lib') -or !(Test-Path -LiteralPath 'node_modules\sharp')){
    Write-Host 'Installing project dependencies from the lock file. No Firebase secrets are needed.'
    & npm.cmd ci --omit=dev
    if($LASTEXITCODE -ne 0){throw 'Dependency installation failed. Check the Internet connection.'}
  }
  Write-Host 'Using theeskapooo.onrender.com and the connected Brother. Keep this window open.'
  & (Join-Path $PSScriptRoot 'start.ps1') -Site 'https://theeskapooo.onrender.com' -SumatraExe $sumatra -Printer $printer
} catch {Write-Host ('Setup stopped: '+$_.Exception.Message) -ForegroundColor Red; exit 1}
