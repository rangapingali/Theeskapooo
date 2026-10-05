$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$output = Join-Path $base 'build'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$shots = Get-Content -LiteralPath (Join-Path $base 'storyboard.json') -Raw | ConvertFrom-Json
$voice = New-Object -ComObject SAPI.SpVoice
$voices = $voice.GetVoices()
for ($i = 0; $i -lt $voices.Count; $i++) {
  if ($voices.Item($i).GetDescription() -like '*Zira*') { $voice.Voice = $voices.Item($i); break }
}
$voice.Rate = 0
$voice.Volume = 100
foreach ($shot in $shots) {
  for ($i = 0; $i -lt $shot.lines.Count; $i++) {
    $stream = New-Object -ComObject SAPI.SpFileStream
    $stream.Format.Type = 22
    $path = Join-Path $output ($shot.id + '-' + $i + '.wav')
    $stream.Open($path, 3, $false)
    $voice.AudioOutputStream = $stream
    [void]$voice.Speak($shot.lines[$i])
    $stream.Close()
  }
  Write-Output ('Narrated ' + $shot.id)
}
