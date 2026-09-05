# Slice 6 — Native camera scan

**Status:** awaiting Josh's approval
**Decisions:** D24 (iOS camera sheet via `@capacitor/camera`), D25 (denied: gallery plus Settings link), 2026-09-05
**Depends on:** slice 2 (shell). Web path untouched.

## What this does

Inside the shell, tapping the shutter opens Apple's camera; the photo comes back as a still and goes through the same normalize-and-upload path the gallery already uses. The branded intro screen stays; the web viewfinder is not shown natively. Gallery picking uses the native Photos picker. Denied camera permission leaves scanning usable and offers the way back.

Done means, on the phone: shutter opens the iOS camera; a captured bottle matches no worse and no slower than the web path (`scan_events.latency_ms`, top-1 on the same bottle); gallery upload works; Don't Allow leads to the denied screen with both actions and the Settings link lands on the app's page. On the web, nothing changes.

## Why a still beats the video frame

The web path grabs a frame from a `getUserMedia` stream and downscales to 1024px. The native sheet returns an autofocused, exposure-locked still, downscaled to the same 1024px so the server sees one payload shape. Same size, sharper input. Whether that moves top-1 accuracy is measured, not assumed: the acceptance criterion is "no worse," with any gain recorded in the log.

## Shape

**New**
- `lib/native-camera.ts`: `takeNativePhoto()` and `pickNativePhoto()`, both returning a data URL or a typed `denied` / `cancelled` result. Dynamic import of `@capacitor/camera`; no-ops on the web. `openAppSettings()` navigates to `app-settings:`, which Capacitor hands to iOS as an external scheme. Verified on device as part of AC 4; if it does not open, the fallback is the written path (Settings → Spritz → Camera), and the button becomes that instruction.
- `prepareFromDataUrl()` in `lib/image-prep.ts`, beside `prepareFromFile`, so the native result gets the identical 1024px / 0.8 JPEG treatment.

**Changed**
- `components/camera-capture.tsx`: when `isNativeApp()`, the intro card's start action calls `takeNativePhoto()` instead of `startCamera()`; the gallery thumbnail calls `pickNativePhoto()`; `denied` sets the existing error state with the existing copy plus two actions, "Choose from Photos" and "Open Settings"; `cancelled` returns to intro. The live/flash/switch-camera code is unreachable natively and untouched.
- `ios/App/App/Info.plist`: `NSPhotoLibraryUsageDescription` = "Spritz uses your photos to identify a fragrance bottle you've already photographed." Camera string already present (D17).
- `package.json`: `@capacitor/camera`.
- `lib/scan-stages.ts` / `/api/scan`: nothing. Payload shape is unchanged. `scan_events.vision_provider` etc. record as today; a `client` column is not added in this slice (slice 12 measurement decides that).

## Acceptance criteria

1. **Given** the shell, **when** the user taps the shutter on the intro screen, **then** the iOS camera sheet opens (first time, after the D17 permission prompt), and the captured photo produces a match page exactly as a web scan would, with `?scan=` on the URL.
2. **Given** the same bottle scanned once through the website in Safari and once natively, **when** both `scan_events` rows are compared, **then** native top-1 is the same or better and `latency_ms` is within 10% of web.
3. **Given** the gallery thumbnail, **when** tapped natively, **then** the Photos picker opens and a chosen photo scans.
4. **Given** camera permission denied, **when** the user taps the shutter, **then** the denied message appears with "Choose from Photos" and "Open Settings"; Photos works; Settings opens the app's own settings page.
5. **Given** the camera sheet, **when** the user cancels, **then** the intro screen is back with no error and no spinner.
6. **Given** the website in any browser, **when** scanning, **then** the viewfinder and file picker behave exactly as before.

## Out of scope

- Android (same plugin, verified with the Android shell).
- Any change to the matcher, the server, or the scan-event schema.
- Flash and camera-switch controls, which the iOS sheet provides itself.

## Shown working

A screen recording of a native scan start to match page, the denied path, and the two `scan_events` rows for AC 2. This recording plus the push one are the 4.2 reviewer-notes material.

## Needs Josh

`npm install`, `npx cap sync ios`, rebuild. No dashboard work.
