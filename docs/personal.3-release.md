# RITM personal.3

- Automatic checks on opening/returning to the app. Updates screen downloads signed personal releases from `blizzardsnake/ritm` and opens Android installation. First installation permission and every installation confirmation belong to Android.
- Settings contains a separate Creators entry with source, fork, full license and data notices.
- Free OpenRouter is selected for unconfigured installations. One owner login and a headless S256 PKCE code connect it; the API key is saved automatically in Android secure storage. No running PC or shared developer key is required. The shared training/nutrition budget counts each completion attempt: 50 per UTC day and 200 in a rolling seven-day window. Explicit server, other provider and off settings are preserved. Legacy anonymous Pollinations requires a fresh connection and cannot reuse another service's saved key.
- AI runs after your request and consent, discloses the external recipient, and offers changes for confirmation. The free service can impose limits or become unavailable; no paid fallback is used.
- Owner sign-in and a real seven-day OpenRouter program remain acceptance checks. Earlier successful Pollinations probes did not cover the owner's later truncated seven-day creation response.
- Package `local.opengym.personal`, versionCode 10003, same existing signing identity. Install over personal.1/personal.2; do not uninstall or clear data.

## Future releases

Update `ritm-release.json` with an increased Android versionCode and new versionName. Run frontend tests, native unit tests and the signing build. Run `scripts/publish-ritm.ps1` with the verified APK and release notes. It creates a complete draft release, verifies asset SHA256 digests, then publishes. Anonymous checks need no GitHub login on the phone. The upstream updater stays disabled.

GitHub Actions remain disabled for this personal repository to avoid running upstream's container publishing or mirror workflows. Signing happens locally; no keystore or developer AI key is uploaded.
