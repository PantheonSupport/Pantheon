param(
    [Parameter(Mandatory)][ValidatePattern('^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?$')][string]$Version,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$Digest,
    [Parameter(Mandatory)][ValidateRange(1,50000000)][long]$Size,
    [Parameter(Mandatory)][int]$HostPid,
    [Parameter(Mandatory)][string]$Ahk
)

$ErrorActionPreference = 'Stop'
$stage = $PSScriptRoot
$root = Split-Path -Parent $stage
$incoming = Join-Path $stage 'incoming'
$backup = Join-Path $stage 'previous'
$archivePath = Join-Path $stage 'release.zip'
$launcher = Join-Path $root 'Pantheon.ahk'
$moved = [System.Collections.Generic.List[object]]::new()
$restart = $false

function Assert-RegularPath([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        $item = Get-Item -LiteralPath $Path -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "The update cannot replace a linked path: $Path"
        }
    }
}

function Move-UpdateItem([string]$From, [string]$To) {
    Assert-RegularPath $From
    Move-Item -LiteralPath $From -Destination $To
    $moved.Add(@{ From = $From; To = $To })
}

try {
    if ($stage -notmatch '[\\/]\.pantheon-update-\d+-\d+$' -or
        (Test-Path -LiteralPath (Join-Path $root '.git')) -or
        !(Test-Path -LiteralPath (Join-Path $root 'Lib\release-manifest.json') -PathType Leaf)) {
        throw 'Updates require an extracted Pantheon release.'
    }
    Assert-RegularPath $root
    Assert-RegularPath $stage
    Assert-RegularPath (Join-Path $root 'Lib')
    Assert-RegularPath (Join-Path $root 'macros')
    $process = Get-Process -Id $HostPid -ErrorAction SilentlyContinue
    if ($process -and !$process.WaitForExit(15000)) { throw 'Pantheon did not close for the update.' }
    $restart = $true

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $url = "https://github.com/PantheonSupport/Pantheon/releases/download/v$Version/Pantheon-$Version.zip"
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 90 -OutFile $archivePath
    if ((Get-Item -LiteralPath $archivePath).Length -ne $Size -or
        (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $Digest) {
        throw 'The downloaded release did not match the published checksum.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    try {
        $expanded = 0L
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName
            if ($name -cnotmatch '^Pantheon/(?:Pantheon\.ahk|README\.md|Lib/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*|macros/macro-[a-z0-9][a-z0-9-]{0,40}\.json)$' -or
                $name -match '\.(?:/|$)' -or !$paths.Add($name)) {
                throw 'The release contains an unexpected or duplicate path.'
            }
            $expanded += $entry.Length
            if ($expanded -gt 150000000 -or $paths.Count -gt 2000) { throw 'The release archive is too large.' }
            $destination = Join-Path $incoming ($name.Substring(9).Replace('/','\'))
            [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination)
        }
    } finally { $archive.Dispose() }

    foreach ($required in @('Pantheon.ahk','Lib\Pantheon.ahk','Lib\Version.ahk','Lib\ui\index.html','Lib\release-manifest.json')) {
        if (!(Test-Path -LiteralPath (Join-Path $incoming $required) -PathType Leaf)) { throw "The release is missing $required." }
    }
    $versionFile = Get-Content -LiteralPath (Join-Path $incoming 'Lib\Version.ahk') -Raw
    if ($versionFile -notmatch ('(?m)^\s*static Current := "'+[regex]::Escape($Version)+'"\s*$')) {
        throw 'The downloaded release has a different version.'
    }
    $oldManifest = Get-Content -LiteralPath (Join-Path $root 'Lib\release-manifest.json') -Raw | ConvertFrom-Json
    $newManifest = Get-Content -LiteralPath (Join-Path $incoming 'Lib\release-manifest.json') -Raw | ConvertFrom-Json
    $newManaged = @{}
    [IO.Directory]::CreateDirectory((Join-Path $backup 'macros')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $root 'macros')) | Out-Null
    $incomingMacros = Join-Path $incoming 'macros'
    if (Test-Path -LiteralPath $incomingMacros) {
        foreach ($macro in Get-ChildItem -LiteralPath $incomingMacros -File) {
            $destination = Join-Path (Join-Path $root 'macros') $macro.Name
            Assert-RegularPath $destination
            if (Test-Path -LiteralPath $destination) {
                $previous = $oldManifest.macros.PSObject.Properties[$macro.Name]
                if (!$previous -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $previous.Value) { continue }
                Move-UpdateItem $destination (Join-Path (Join-Path $backup 'macros') $macro.Name)
            }
            $newManaged[$macro.Name] = (Get-FileHash -LiteralPath $macro.FullName -Algorithm SHA256).Hash
            Move-UpdateItem $macro.FullName $destination
        }
    }
    $newManifest.macros = $newManaged
    $newManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $incoming 'Lib\release-manifest.json') -Encoding UTF8
    foreach ($name in @('Lib','Pantheon.ahk','README.md')) {
        $old = Join-Path $root $name
        $new = Join-Path $incoming $name
        if (!(Test-Path -LiteralPath $new)) { continue }
        if (Test-Path -LiteralPath $old) { Move-UpdateItem $old (Join-Path $backup $name) }
        Move-UpdateItem $new $old
    }
} catch {
    $message = $_.Exception.Message
    for ($index = $moved.Count - 1; $index -ge 0; $index--) {
        try { Move-Item -LiteralPath $moved[$index].To -Destination $moved[$index].From }
        catch { $restart = $false; $message += "`nRollback failed: $($_.Exception.Message)" }
    }
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show("$message`n`nUpdate files: $stage", 'Pantheon update failed')
}
if ($restart) {
    Start-Process -FilePath $Ahk -ArgumentList ('"' + $launcher + '"') -WorkingDirectory $root
}
