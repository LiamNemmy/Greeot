# Capacitor mobile wrapper setup

This project can run as a Capacitor shell around the existing web app without changing browser behavior.

## Prerequisites

- Node.js 18+ and npm
- Android: Android Studio + Android SDK
- iOS: macOS with Xcode (iOS build tooling is not available on Windows/Linux)

## Configure hosted URL mode (optional)

Capacitor reads `CAP_SERVER_URL` from your shell or `.env`.

- If `CAP_SERVER_URL` is set, the mobile app loads that hosted URL.
- If `CAP_SERVER_URL` is empty, the app uses bundled web assets from `mobile-web/`.

PowerShell:

```powershell
$env:CAP_SERVER_URL="https://your-production-domain.example"
```

Bash/zsh:

```bash
export CAP_SERVER_URL="https://your-production-domain.example"
```

## Platform workflows

1. Install dependencies:

```bash
npm install
```

2. Add native projects (first time only):

```bash
npm run cap:add:android
npm run cap:add:ios
```

3. Sync updated web assets/config into native projects:

```bash
npm run cap:sync
```

4. Open native IDE projects:

```bash
npm run cap:open:android
npm run cap:open:ios
```

## Build and test

- Android: run on emulator/device from Android Studio after `cap:sync`.
- iOS: run on simulator/device from Xcode after `cap:sync` (macOS only).
- Re-run `npm run cap:sync` whenever web assets or Capacitor config change.

## Launch splash behavior

- Native launch splash is configured in `capacitor.config.js` (`plugins.SplashScreen`).
- `js/mobile-splash.js` hides the native splash once the web page fully loads on native platforms.
- If you tune splash visuals or timing, run `npm run cap:sync` before rebuilding/running native apps.
