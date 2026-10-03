param(
    [Parameter(Mandatory = $true)][string]$Apk,
    [Parameter(Mandatory = $true)][string]$NotesFile,
    [string]$SourceArchive,
    [string]$SdkRoot = $env:ANDROID_SDK_ROOT
)
# Local publishing deliberately keeps the signing key out of GitHub/Actions.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$release = Get-Content -LiteralPath (Join-Path $repoRoot 'ritm-release.json') -Raw | ConvertFrom-Json
$repo = $release.repository
if ($repo -ne 'blizzardsnake/ritm') { throw 'Review the pinned repository before publishing' }
$Apk = (Resolve-Path -LiteralPath $Apk).Path
$notes = Get-Content -LiteralPath $NotesFile -Raw
$apkName = 'RITM-' + $release.versionName + '.apk'
if ((Split-Path -Leaf $Apk) -ne $apkName) { throw 'APK name does not match release config' }
$priorLocation = Get-Location
$priorInteractive = $env:GCM_INTERACTIVE
$credentialPassword = $null; $githubHeaders = $null
function Api($method, $path, $body = $null) {
    $params = @{ Method=$method; Uri=('https://api.github.com' + $path); Headers=$githubHeaders }
    if ($null -ne $body) { $params.ContentType='application/json'; $params.Body=($body | ConvertTo-Json -Depth 8 -Compress) }
    Invoke-RestMethod @params
}
try {
    Set-Location $repoRoot
    $signerOutput = & "$SdkRoot/build-tools/35.0.0/apksigner.bat" verify --verbose --print-certs $Apk 2>&1
    if ($LASTEXITCODE -ne 0 -or -not ($signerOutput -match ('certificate SHA-256 digest: ' + $release.signingCertSha256))) { throw 'APK signature does not match the pinned personal signing identity' }
    # Read the artifact itself: a correctly signed old APK must never be published
    # with metadata copied from a newer config. A relative filename also works with
    # aapt on Windows when the owner's parent directory contains Cyrillic.
    Push-Location (Split-Path -Parent $Apk)
    try {
        $badging = (& "$SdkRoot/build-tools/35.0.0/aapt.exe" dump badging (Split-Path -Leaf $Apk) 2>&1) -join "`n"
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect APK metadata' }
    } finally { Pop-Location }
    $package = [regex]::Match($badging, "(?m)^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'")
    $sdk = [regex]::Match($badging, "(?m)^sdkVersion:'([0-9]+)'")
    if (!$package.Success -or !$sdk.Success -or
        $package.Groups[1].Value -ne $release.applicationId -or
        [long]$package.Groups[2].Value -ne $release.versionCode -or
        $package.Groups[3].Value -ne $release.versionName -or
        [int]$sdk.Groups[1].Value -ne $release.minSdk) {
        throw 'APK package, version or minSdk does not match release config'
    }
    if (git status --porcelain) { throw 'Commit and verify the release before publishing' }
    $sha256 = (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant()
    $tag = 'ritm-v' + $release.versionName
    $dir = Join-Path $repoRoot ('artifacts/releases/' + $release.versionName)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $manifestFile = Join-Path $dir 'ritm-update.json'
    $checksumFile = Join-Path $dir ($apkName + '.sha256')
    $manifest = [ordered]@{ schema=1; applicationId=$release.applicationId; versionCode=$release.versionCode; versionName=$release.versionName; minSdk=$release.minSdk; bytes=(Get-Item -LiteralPath $Apk).Length; sha256=$sha256; signingCertSha256=$release.signingCertSha256; apkUrl="https://github.com/$repo/releases/download/$tag/$apkName"; notes=$notes.Trim() }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestFile -Encoding utf8
    "$sha256  $apkName" | Set-Content -LiteralPath $checksumFile -Encoding ascii
    $env:GCM_INTERACTIVE='never'
    $credentialRequest="protocol=https`nhost=github.com`nusername=blizzardsnake`n`n"
    $credentialResult=$credentialRequest | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'Stored GitHub authentication unavailable' }
    $credentialPassword=($credentialResult | Where-Object { $_ -like 'password=*' }) -replace '^password=',''
    $credentialResult=$null
    if (!$credentialPassword) { throw 'No stored GitHub credential' }
    $githubHeaders=@{ Authorization="Bearer $credentialPassword"; Accept='application/vnd.github+json'; 'X-GitHub-Api-Version'='2022-11-28'; 'User-Agent'='RITM-release' }
    $user = Api 'GET' '/user'
    if ($user.login -ne 'blizzardsnake') { throw 'Wrong GitHub account' }
    $repositories = Api 'GET' '/user/repos?per_page=100&type=owner'
    $repository = $repositories | Where-Object { $_.full_name -eq $repo }
    if (!$repository) { $repository = Api 'POST' '/user/repos' @{ name='ritm'; private=$false; auto_init=$false; description='RITM personal Android fitness: training, nutrition, recovery and AI. OpenGym fork (AGPL).' } }
    if ($repository.private -or $repository.owner.login -ne $user.login) { throw 'Public personal repository identity mismatch' }
    # The inherited upstream workflows must not publish containers or push to its GitLab mirror.
    Api 'PUT' "/repos/$repo/actions/permissions" @{ enabled=$false } | Out-Null
    $remoteUrl = "https://github.com/$repo.git"
    $existingRemote = git remote get-url ritm 2>$null
    if ($LASTEXITCODE -eq 0) { if ($existingRemote -ne $remoteUrl) { throw 'Unexpected ritm remote' } }
    else { git remote add ritm $remoteUrl; if ($LASTEXITCODE -ne 0) { throw 'Could not add personal remote' } }
    git push ritm HEAD:refs/heads/personal
    if ($LASTEXITCODE -ne 0) { throw 'Source push failed' }
    Api 'PATCH' "/repos/$repo" @{ default_branch='personal' } | Out-Null
    $existingTag = git rev-parse --verify "refs/tags/$tag" 2>$null
    if ($LASTEXITCODE -eq 0) { if ($existingTag -ne (git rev-parse HEAD)) { throw 'Release tag already refers to another commit' } }
    else { git tag $tag; if ($LASTEXITCODE -ne 0) { throw 'Could not create release tag' } }
    git push ritm "refs/tags/$tag"
    if ($LASTEXITCODE -ne 0) { throw 'Tag push failed' }
    $releases = Api 'GET' "/repos/$repo/releases?per_page=100"
    $draft = $releases | Where-Object { $_.tag_name -eq $tag }
    if ($draft -and !$draft.draft) { throw 'Release is already public; publish a new version instead of replacing it' }
    if (!$draft) { $draft = Api 'POST' "/repos/$repo/releases" @{ tag_name=$tag; target_commitish='personal'; name=('RITM ' + $release.versionName); body=$notes; draft=$true; prerelease=$false } }
    $files = @($Apk, $checksumFile, $manifestFile)
    if ($SourceArchive) { $files += (Resolve-Path -LiteralPath $SourceArchive).Path }
    foreach ($assetPath in $files) {
        $name = Split-Path -Leaf $assetPath
        $existing = $draft.assets | Where-Object { $_.name -eq $name }
        if ($existing) {
            $localDigest = 'sha256:' + (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($existing.size -ne (Get-Item -LiteralPath $assetPath).Length -or $existing.digest -ne $localDigest) { throw "Existing draft asset differs: $name" }
            continue
        }
        $uploadUrl = 'https://uploads.github.com/repos/' + $repo + '/releases/' + $draft.id + '/assets?name=' + [Uri]::EscapeDataString($name)
        Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers $githubHeaders -ContentType 'application/octet-stream' -InFile $assetPath | Out-Null
    }
    $uploaded = Api 'GET' "/repos/$repo/releases/$($draft.id)"
    foreach ($assetPath in $files) {
        $asset = $uploaded.assets | Where-Object { $_.name -eq (Split-Path -Leaf $assetPath) }
        $expectedDigest = 'sha256:' + (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if (!$asset -or $asset.size -ne (Get-Item -LiteralPath $assetPath).Length -or $asset.digest -ne $expectedDigest) { throw 'Uploaded asset integrity check failed; release remains a draft' }
    }
    $published = Api 'PATCH' "/repos/$repo/releases/$($draft.id)" @{ draft=$false; make_latest='true' }
    [PSCustomObject]@{ repository=$repository.html_url; release=$published.html_url; apk=$manifest.apkUrl; sha256=$sha256; versionCode=$release.versionCode } | ConvertTo-Json
} finally {
    $credentialPassword=$null; $githubHeaders=$null
    $env:GCM_INTERACTIVE=$priorInteractive
    Set-Location $priorLocation
}
