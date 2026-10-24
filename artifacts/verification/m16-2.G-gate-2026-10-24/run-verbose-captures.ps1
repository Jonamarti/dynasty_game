# M16 2.G gate — verbose captures for transition causes.
# One scenario at a time, serial. Only the scenarios whose matrix comparison
# gained a new fail (pass->fail or na->fail) need their per-check explanation,
# plus the pass->na cases read from the same report. Exits 0 regardless: the
# single-run replay also engages wall-clock checks the matrix disables.
$ErrorActionPreference = 'Continue'
$out = Split-Path -Parent $MyInvocation.MyCommand.Path
$scenarios = 'smiths','band','century','craft','wilds','emptied','hearths','scribes','harsh-winter','coast','millers','hunters','herders','feasts','stewards','polity','conquest','culture','lean','diggers','orchard'
$summary = @()
foreach ($s in $scenarios) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & npm.cmd run sim:check -- --scenario $s --verbose 2>&1 |
        Out-File -FilePath (Join-Path $out "verbose-$s.log") -Encoding utf8
    $code = $LASTEXITCODE
    $sw.Stop()
    $summary += [pscustomobject]@{ scenario = $s; wallSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 2); exitCode = $code }
    $summary | ConvertTo-Json | Set-Content -Path (Join-Path $out 'verbose-summary.json') -Encoding utf8
    Write-Host ("{0,12}  {1,9:N2} s  exit {2}" -f $s, $summary[-1].wallSeconds, $code)
}
Write-Host 'VERBOSE CAPTURES DONE'
