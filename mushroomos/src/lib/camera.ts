/**
 * Point-of-capture photographs. `DEC-026`, task `UI-002`, finding F32.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Evidence was captured with `<input type="file" capture="environment">`. On current Android that
 * attribute is a hint the WebView is free to ignore, and on the 10 September device run it did:
 * the button opened the system Photo Picker — a gallery — on an emulator that HAS a camera app
 * registered. A photo from last week could then satisfy "before you begin", which is an evidence
 * integrity defect, not a convenience one.
 *
 * In the Android app, the native camera plugin opens the CAMERA and nothing else (`source: Camera`,
 * never `Prompt` or `Photos`), and nothing is saved to the phone's gallery.
 *
 * In a desktop browser there is no camera guarantee to be had, so the web path still uses a file
 * input — and says so on screen (`cameraIsGuaranteed()`), rather than pretending. Floor users use
 * the app.
 *
 * WHAT THIS DOES NOT DO: decide whether a photo is required, how many, or whether it counts. That is
 * `v_evidence_state` and `bind_evidence`. This only produces real image bytes.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** True in the installed Android app, where the camera — not a gallery — is guaranteed. */
export function cameraIsGuaranteed(): boolean {
  return Capacitor.isNativePlatform();
}

/** The person closed the camera without taking a picture. Not an error worth showing. */
export class CaptureCancelled extends Error {
  constructor() {
    super('Capture cancelled');
  }
}

/**
 * Open the device camera and return the photograph as a File.
 *
 * Native only — the web path is a file input in the component, because a browser can only open a
 * picker from a real user gesture on an <input>.
 */
export async function takeNativePhoto(): Promise<File> {
  let photo;
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 80,
      width: 1920,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
    });
  } catch (e) {
    const msg = (e as Error)?.message?.toLowerCase() ?? '';
    if (msg.includes('cancel')) throw new CaptureCancelled();
    if (msg.includes('permission') || msg.includes('denied')) {
      throw new Error(
        'The camera is not allowed for MushroomOS. Open the phone Settings → Apps → MushroomOS → ' +
          'Permissions, allow Camera, then try again.'
      );
    }
    throw e;
  }
  if (!photo.webPath) throw new Error('The camera returned no picture. Try again.');
  const blob = await (await fetch(photo.webPath)).blob();
  const type = blob.type || `image/${photo.format === 'png' ? 'png' : 'jpeg'}`;
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `capture-${Date.now()}.${ext}`, { type });
}

/**
 * The first bytes must be a real JPEG, PNG or WebP. F40.
 *
 * The storage bucket enforces the DECLARED type only, so a renamed PDF or HTML file declared
 * `image/jpeg` would be accepted and bound as a photograph. The server cannot see the bytes from
 * SQL; this is the earliest place that can, and it refuses before anything is uploaded.
 */
export async function assertIsImage(file: File): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const webp =
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  if (!(jpeg || png || webp)) {
    throw new Error('That file is not a photograph (JPEG, PNG or WebP). Take a photo instead.');
  }
  if (file.size === 0) throw new Error('The photograph is empty. Take it again.');
}
