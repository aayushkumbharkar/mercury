$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$segments=Get-Content -Raw "$PSScriptRoot/narration.json" | ConvertFrom-Json
$speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Zira Desktop')
$speaker.Rate=0
for($i=0;$i -lt $segments.Count;$i++) {
 $speaker.SetOutputToWaveFile((Join-Path $PSScriptRoot "audio/segment-$i.wav"))
 $speaker.Speak($segments[$i].text)
}
$speaker.SetOutputToNull()
$speaker.Dispose()

