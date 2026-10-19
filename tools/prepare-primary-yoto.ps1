param(
  [string]$SourceDirectory = 'C:\Users\sterl\Videos\4K Video Downloader+\Primary Program 2026'
)

$ErrorActionPreference = 'Stop'
$outputDirectory = Join-Path $SourceDirectory 'Yoto - Primary Program'
$iconDirectory = Join-Path $outputDirectory 'Icons'
$appIconDirectory = Join-Path $PSScriptRoot '..\apps\primary-program\yoto-icons'

$tracks = @(
  @{ Source = 'Choose to Serve the Lord - by Blake Gillette and Angie Killian.m4a'; Name = '01 - Choose to Serve the Lord.m4a'; Icon = '01-choose-to-serve.svg' },
  @{ Source = "I'll Walk with You   LDS Primary Song Sing Along.m4a"; Name = "02 - I'll Walk with You.m4a"; Icon = '02-walk-with-you.svg' },
  @{ Source = 'Holy Places - Hymn #1026 (With Lyrics).m4a'; Name = '03 - Holy Places.m4a'; Icon = '03-holy-places.svg' },
  @{ Source = "I'm Trying to Be Like Jesus    Primary Song Sing Along.m4a"; Name = "04 - I'm Trying to Be Like Jesus.m4a"; Icon = '04-trying-to-be-like-jesus.svg' },
  @{ Source = "I Feel My Savior's Love   Primary Song Sing Along.m4a"; Name = "05 - I Feel My Savior's Love.m4a"; Icon = '05-feel-saviors-love.svg' },
  @{ Source = 'My Heavenly Father Loves Me   LDS Primary Song Sing Along.m4a'; Name = '06 - My Heavenly Father Loves Me.m4a'; Icon = '06-heavenly-father-loves-me.svg' },
  @{ Source = 'Kindness Begins with Me   LDS Primary Song Sing Along.m4a'; Name = '07 - Kindness Begins with Me.m4a'; Icon = '07-kindness-begins-with-me.svg' },
  @{ Source = 'I Will Walk with Jesus   LDS Primary Song Sing Along.m4a'; Name = '08 - I Will Walk with Jesus.m4a'; Icon = '08-walk-with-jesus.svg' }
)

if (-not (Test-Path -LiteralPath $SourceDirectory -PathType Container)) {
  throw "Source folder not found: $SourceDirectory"
}
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null

foreach ($track in $tracks) {
  $sourcePath = Join-Path $SourceDirectory $track.Source
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing source track: $sourcePath"
  }
  Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $outputDirectory $track.Name) -Force
  Copy-Item -LiteralPath (Join-Path $appIconDirectory $track.Icon) -Destination (Join-Path $iconDirectory $track.Icon) -Force
}

$instructions = @'
PRIMARY PROGRAM — YOTO PLAYLIST

The numbered audio files in this folder are already in playlist order.

1. Open https://my.yotoplay.com/my-cards and sign in with the email used in your Yoto app.
2. Choose New Playlist, then Make New. Upload the eight numbered audio files from this folder in one selection.
3. Save the playlist. In the Yoto app, open it, choose the three-dot menu, then Link to a Card. Follow the prompt for your existing Make Your Own card.
4. To add the song pictures, open the playlist at my.yotoplay.com/my-cards. Use the palette next to each track, open My Icons, and upload the matching SVG from the Icons folder. Repeat for each track.

The icons are transparent 16 × 16 SVGs designed for Yoto's small display. The audio remains in the original M4A format.
'@
Set-Content -LiteralPath (Join-Path $outputDirectory 'README - Yoto playlist.txt') -Value $instructions -Encoding utf8
Write-Host "Yoto-ready playlist created: $outputDirectory"
