# RITM personal updates and creators

The owner wants future versions delivered within the Android app, without downloading APKs by hand, and a clean Settings screen with attribution in a separate Creators page. Public source and releases were explicitly selected. Existing personal branches and signing identity must be preserved.

## Design

Use public GitHub releases in `blizzardsnake/ritm`, built and signed locally. No shared AI key, signing key or diaries are published. Do not enable the original upstream updater. A release contains a signed APK, checksum and a versioned `ritm-update.json` manifest. Publish the release only after every asset is uploaded.

The app checks at startup and foreground resume, with a 15 minute throttle, plus a manual refresh. Automatic checks are enabled by default and can be disabled. A compact notification links to an Updates screen. Download and install is an in-app action with actual byte progress, cancellation and retry. Android still asks the person to approve installation, and may require allowing RITM to install apps once. This is not a promise of silent installation or background push.

Compare integer Android versionCode, never a semver suffix. Accept only the pinned repository's HTTPS release URLs and expected manifest fields. Stream into a private cache file. Check bounded file size, exact SHA256, package ID, versionCode and the existing release signing certificate before opening the installer; repeat verification immediately before installation. Failed/partial downloads cannot be installed. Installer permission denial and cancellation remain recoverable without changing user data.

Settings ends with two rows: Updates and Creators. Creators displays the RITM version, fork attribution, source, AGPL and third-party notices, font and food data credits. Original training statistics, nutrition and assistant flows stay intact.

## Constraints and acceptance

- Application ID `local.opengym.personal`, minSdk 26, targetSdk 35.
- Release `1.3.9-personal.3`, versionCode `10003`, same existing private signing key.
- Public certificate SHA256 `ac787bac688d73262907d696c2c410382f88d52155d0a634d3389d14a0d8ac44`.
- No public user data, private credentials or keystore, including Git history.
- Public anonymous latest-release lookup and downloads work; source and original history retained.
- Automated tests cover invalid/untrusted manifests, downgrade prevention, throttling, concurrency, failure recovery and native URL/identity policy.
- Native build and signature verification required. Real Android installation remains device acceptance; do not describe compilation as an executed phone test.

## Decisions

The owner's additional request is built-in training and nutrition AI without manual API keys, with 50 daily or 200 weekly requests. After an actual seven-day Pollinations response was truncated, the owner explicitly requested another provider and full personal account setup. Use free OpenRouter, the documented headless S256 PKCE login and an expiring one-time code. Android opens official Chrome Custom Tabs and keeps the key in secure storage; the web preview keeps secrets only in memory. No owner or developer key is embedded in the public APK. Personal sign-in and accepting Terms require owner participation. Preserve explicit server/other provider/off selections; migration from anonymous Pollinations requires fresh auth and blocks stale keys. Reset previous training consent on connecting the new service. Count every HTTP completion attempt across both training and nutrition, including repairs/retries, with 50 per UTC day and 200 in a rolling seven-day window. Serialize all device writes, publish cache after durable success and keep failures recoverable. Pin free-only models, zero price and no paid fallback. Retain schema validation, snapshot conflict checks and manual application. Real owner login and seven-day generation remain acceptance checks; earlier Pollinations probes are historical evidence only.

Implement in the current personal checkout, which already contains the updater flow. The owner has delegated completion; proceed under that authorization rather than add repeated spec/plan approval requests. GitHub is preferable to a separate server because it already hosts upstream, provides free public APK delivery and requires no account on the phone. Direct local publishing avoids uploading the signing key to CI.
