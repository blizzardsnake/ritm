# RITM Updates Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then one focused fresh-context review of the new update feature.

**Goal:** Deliver future signed RITM versions from public GitHub releases within the app and move credits to Creators.

**Architecture:** Dedicated personal release validation and controller, native streaming downloader and APK identity verification, React Updates/Creators routes. Reuse existing repository, Android installer and premium styling.

**Tech Stack:** React, Capacitor 7, Java, PowerShell, GitHub Releases REST API.

**Spec:** ../specs/2026-10-03-ritm-updates-design.md

## Global Constraints

- `local.opengym.personal`, minSdk 26, targetSdk 35, versionCode 10003, `1.3.9-personal.3`.
- Same release signing certificate; upstream updates remain disabled.
- No diary, private key or credential publication. No silent installer claim.

## Review Focus

- Invalid or tampered assets fail closed; native verification repeats on installation.
- Offline/rate-limited checks preserve a discovered update and allow manual retry.
- Concurrent checks/downloads and late progress events cannot break recovery.
- Android unknown-source permission and cancelled installer retain a retry action.
- Credits remain available, without the old multi-line Settings footer.

## Tasks

1. Personal release channel: write failing parser/controller tests, run RED, implement pinned config/validation/check lifecycle, run GREEN.
2. Native delivery: failing pure Java URL/identity/version policy tests, RED, implement streaming cache download/progress/cancel/permission/installer verification, GREEN and build.
3. Product UI: Updates + Creators, auto-check/banner, compact Settings rows, RU/EN translations, focused UI verification and full frontend tests.
4. Verify/publish: one focused code review, fix material findings, mobile build and same-key APK signing, audit source/history, public repository and complete draft release, verify anonymous manifests/checksum/download. Record evidence and give the final APK link.

Additional owner request: default free AI. Implement a shared pinned anonymous Pollinations adapter, default only for unconfigured devices, disclose the recipient in all consent screens, and retain proposal validation/manual apply. Verify defaults, explicit off, request shape, compact missing recovery records and both real synthetic training/nutrition calls before release.

Owner acceptance found a truncated seven-day creation answer and requested another provider with 50 requests/day or 200/week. Replace the default with free-only OpenRouter. Offer official S256 PKCE headless sign-in (one-time code, no manual API key), secure native verifier storage, bounded expiry/replay/concurrency checks and manual-key fallback. Count actual OpenRouter completion requests, including repairs/retries, against a shared 50/day UTC and 200/rolling-seven-days device budget. Preserve paid-provider safeguards and explicit Off. The owner must perform personal sign-in and acceptance of provider terms. Do not publish the anonymous-mode APK as the accepted replacement.
