param(
    [string]$JdkHome = $env:JAVA_HOME,
    [string]$SdkRoot = $env:ANDROID_SDK_ROOT,
    [Parameter(Mandatory = $true)][string]$SigningRecovery,
    [string]$OutputApk,
    [string]$NpmCli
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (!$OutputApk) { $OutputApk = Join-Path $repoRoot 'artifacts/RITM-1.3.9-personal.2.apk' }
if (!(Test-Path -LiteralPath "$JdkHome/bin/java.exe") -or !(Test-Path -LiteralPath "$SdkRoot/build-tools/35.0.0/apksigner.bat")) { throw 'Set JDK 21 and Android SDK (platform36, build-tools35.0.0) paths' }
$recovery = Get-Content -LiteralPath $SigningRecovery -Raw | ConvertFrom-Json
$keystore = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $SigningRecovery)) $recovery.keystore
if (!(Test-Path -LiteralPath $keystore) -or $recovery.applicationId -ne 'local.opengym.personal' -or !$recovery.password) { throw 'Invalid personal signing recovery record' }
$OutputApk = [IO.Path]::GetFullPath($OutputApk)
$outputDir = Split-Path -Parent $OutputApk
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
function CheckExit { if ($LASTEXITCODE -ne 0) { throw "Build command failed: exit $LASTEXITCODE" } }
$priorLocation = Get-Location
$names = @('JAVA_HOME','ANDROID_SDK_ROOT','JAVA_TOOL_OPTIONS','VITE_MOBILE','VITE_IMG_BASE','VITE_GIF_BASE','APP_BUILD','RITM_SIGNING_PASSWORD')
$previous = @{}; foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:JAVA_HOME = $JdkHome; $env:ANDROID_SDK_ROOT = $SdkRoot
    # Windows JDK pipe initialization needs a writable ASCII path. Existing TEMP
    # is suitable when ASCII; otherwise the caller supplies an ASCII JAVA_TMP.
    $javaTmp = if ($env:JAVA_TMP) { $env:JAVA_TMP } else { $env:TEMP }
    if ($javaTmp -match '[^\x00-\x7f]') { throw 'Set JAVA_TMP to a writable ASCII path, or use an ASCII Windows account path' }
    $env:JAVA_TOOL_OPTIONS = "-Dfile.encoding=COMPAT -Djdk.net.unixdomain.tmpdir=$javaTmp"
    Set-Location (Join-Path $repoRoot 'frontend')
    if ($NpmCli) { & node $NpmCli ci } else { & npm.cmd ci }; CheckExit
    $env:VITE_MOBILE = '1'; $env:APP_BUILD = 'personal.2'
    $env:VITE_IMG_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/'
    $env:VITE_GIF_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/'
    & node node_modules/vite/bin/vite.js build; CheckExit
    & node node_modules/@capacitor/cli/bin/capacitor sync android; CheckExit
    Set-Location android
    & ./gradlew.bat :app:assembleRelease :app:testDebugUnitTest --no-daemon; CheckExit
    $env:RITM_SIGNING_PASSWORD = $recovery.password
    & "$SdkRoot/build-tools/35.0.0/apksigner.bat" sign --ks $keystore --ks-key-alias $recovery.alias --ks-pass env:RITM_SIGNING_PASSWORD --key-pass env:RITM_SIGNING_PASSWORD --out $OutputApk app/build/outputs/apk/release/app-release-unsigned.apk; CheckExit
    & "$SdkRoot/build-tools/35.0.0/apksigner.bat" verify --verbose --print-certs $OutputApk; CheckExit
    (Get-FileHash -LiteralPath $OutputApk -Algorithm SHA256).Hash.ToLowerInvariant() | Set-Content -LiteralPath "$OutputApk.sha256" -Encoding ascii
    Write-Output "Signed APK saved: $OutputApk"
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    Set-Location $priorLocation
    $recovery = $null
}

