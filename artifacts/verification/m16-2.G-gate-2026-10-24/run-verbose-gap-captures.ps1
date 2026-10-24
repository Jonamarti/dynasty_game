# M16 2.G gate — verbose captures for the three scenarios the first run
# skipped: they have pass->na transitions in diff.log but no new fail, so the
# main list missed them. Serial, one at a time. Exits 0 regardless.
$ErrorActionPreference = 'Continue'
$out = Split-Path -Parent $MyInvocation.MyCommand.Path
$summary = Get-Content (Join-Path $out 'verbose-summary.json') -Raw | ConvertFrom-Json
foreach ($s in 'traps','fishers','farmers','labour','crowded') {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & npm.cmd run sim:check -- --scenario $s --verbose 2>&1 |
        Out-File -FilePath (Join-Path $out "verbose-$s.log") -Encoding utf8
    $code = $LASTEXITCODE
    $sw.Stop()
    $summary += [pscustomobject]@{ scenario = $s; wallSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 2); exitCode = $code }
    $summary | ConvertTo-Json | Set-Content -Path (Join-Path $out 'verbose-summary.json') -Encoding utf8
    Write-Host ("{0,12}  {1,9:N2} s  exit {2}" -f $s, $summary[-1].wallSeconds, $code)
}
Write-Host 'VERBOSE GAP CAPTURES DONE'
