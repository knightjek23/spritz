// Native camera and photo picker for the shell. Client only, no-ops on
// the web. D24 (iOS camera sheet via @capacitor/camera), D25 (denied:
// gallery plus a Settings link). Design:
// docs/superpowers/specs/2026-09-05-slice-6-native-camera-design.md
//
// Both functions resolve to a discriminated result rather than throwing,
// so the component can branch on "denied" / "cancelled" without parsing
// error messages that differ by plugin version.
//
// Photos come back as a data URL and go through prepareFromDataUrl() so
// the server sees the same ≤1024px JPEG the web viewfinder and the file
// picker produce. quality: 90 here is the plugin's JPEG quality for the
// intermediate; the final encode is lib/image-prep's 0.8.

import { isNativeApp } from "./native";

export type NativePhotoResult =
  | { kind: "photo"; dataUrl: string }
  | { kind: "cancelled" }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

type CameraModule = typeof import("@capacitor/camera");

async function loadCamera(): Promise<CameraModule | null> {
  if (!isNativeApp()) return null;
  return import("@capacitor/camera");
}

function classify(e: unknown): NativePhotoResult {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  // The plugin's cancel message is "User cancelled photos app" on iOS and
  // "User canceled photos app" on Android; denial says "denied" or
  // "permission" somewhere in it.
  if (/cancel/i.test(msg)) return { kind: "cancelled" };
  if (/denied|permission|not allowed/i.test(msg)) return { kind: "denied" };
  return { kind: "error", message: msg || "Camera failed" };
}

async function getPhoto(source: "CAMERA" | "PHOTOS"): Promise<NativePhotoResult> {
  const mod = await loadCamera();
  if (!mod) return { kind: "unavailable" };
  const { Camera, CameraResultType, CameraSource } = mod;

  // Ask for exactly the permission this action needs. On iOS the Photos
  // picker (PHPicker) needs none, but the plugin still reports it.
  const want = source === "CAMERA" ? "camera" : "photos";
  try {
    let status = await Camera.checkPermissions();
    if (status[want] === "prompt" || status[want] === "prompt-with-rationale") {
      status = await Camera.requestPermissions({ permissions: [want] });
    }
    if (status[want] === "denied") return { kind: "denied" };
  } catch (e) {
    return classify(e);
  }

  try {
    const photo = await Camera.getPhoto({
      source: source === "CAMERA" ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: 90,
      correctOrientation: true,
      // Skip the plugin's own crop/confirm screen; the iOS camera sheet
      // already has Retake / Use Photo.
      allowEditing: false,
      saveToGallery: false,
    });
    if (!photo.dataUrl) return { kind: "error", message: "No image returned" };
    return { kind: "photo", dataUrl: photo.dataUrl };
  } catch (e) {
    return classify(e);
  }
}

/** Open the iOS camera sheet. */
export function takeNativePhoto(): Promise<NativePhotoResult> {
  return getPhoto("CAMERA");
}

/** Open the native Photos picker. */
export function pickNativePhoto(): Promise<NativePhotoResult> {
  return getPhoto("PHOTOS");
}

/**
 * Deep-link to this app's page in iOS Settings, where the camera toggle
 * lives. Capacitor hands non-http schemes to UIApplication.open, which
 * treats app-settings: as the Settings deep link. Verified on device as
 * part of slice 6 AC 4; the caller shows the written path as well in case
 * a future iOS stops honouring it.
 */
export function openAppSettings(): void {
  if (!isNativeApp()) return;
  window.location.href = "app-settings:";
}
