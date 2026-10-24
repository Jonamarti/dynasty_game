# M16 2.G gate — serial verification chain.
# Matrix with --json, explicit baseline diff, then the two cohorts one at a
# time (R27: never two cohorts at once). Each step keeps a log beside this
# script; per-step exit codes are recorded, not judged: the matrix and cohorts
# inherit the red baseline checks (R21), and the diff's own exit code is in
# steps.json (1 there means a pass->fail transition was found for scrutiny).
$ErrorActionPreference = 'Continue'
$out = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:steps = @()
$script:log = "$out/chain-progress.txt"

function Step([string] $name, [scriptblock] $body) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $body 2>&1 | Out-File -FilePath "$out/$name.log" -Encoding utf8
    $code = $LASTEXITCODE
    $sw.Stop()
    $script:steps += [pscustomobject]@{ step = $name; wallSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 2); exitCode = $code }
    $script:steps | ConvertTo-Json | Set-Content -Path "$out/steps.json" -Encoding utf8
    $line = "step $name exit $code wall $([math]::Round($sw.Elapsed.TotalSeconds, 2)) s"
    $line | Tee-Object -FilePath $script:log -Append
}

Step 'matrix' { npm.cmd run sim:check:all -- --slow --json "$out/matrix.json" }
Step 'diff' {
    npm.cmd run baseline:diff -- (Join-Path (Get-Location) 'artifacts/verification/m16-baseline/matrix.json') "$out/matrix.json"
}
Step 'cohort-band' { npm.cmd run sim:seeds -- --scenario band --seeds 20 }
Step 'cohort-century' { npm.cmd run sim:seeds -- --scenario century --seeds 20 }
Write-Host 'CHAIN DONE'
