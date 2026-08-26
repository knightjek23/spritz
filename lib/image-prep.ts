// Client-side image normalization for /scan.
//
// Every photo goes through here before it's POSTed, whether it came from
// the live camera or the gallery picker. Before v2 the gallery path sent
// the file untouched: a 12 MP phone JPEG is 3–5 MB, ~4–7 MB as base64, and
// that upload alone was often the slowest part of a scan on cellular.
//
// Target: longest edge MAX_EDGE px, JPEG at QUALITY. At 1024 px GPT's
// high-detail tiling costs ~765 image tokens, and the embedding provider
// downsizes anything over 2 MP anyway, so nothing upstream benefits from
// more pixels. Typical output is 120–250 KB.
//
// Browser-only (uses createImageBitmap / canvas). Never import from a
// server module.

export const MAX_EDGE = 1024;
export const QUALITY = 0.8;

export interface PreparedImage {
  /** Raw base64, no data: prefix — the shape /api/scan expects. */
  base64: string;
  /** data: URL for previewing the frozen frame. */
  dataUrl: string;
  width: number;
  height: number;
}

function scaleFor(w: number, h: number): number {
  const longest = Math.max(w, h);
  return longest > MAX_EDGE ? MAX_EDGE / longest : 1;
}

function encode(canvas: HTMLCanvasElement): PreparedImage {
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  return {
    base64: dataUrl.split(",")[1] ?? "",
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Draw a live <video> frame to a canvas at scan resolution.
 * Returns null when the video has no frame yet.
 */
export function prepareFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): PreparedImage | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const s = scaleFor(vw, vh);
  canvas.width = Math.round(vw * s);
  canvas.height = Math.round(vh * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const out = encode(canvas);
  return out.base64.length < 1000 ? null : out;
}

/**
 * Decode a picked file, honour EXIF orientation where the browser supports
 * it, and downscale. Falls back to an <img> decode for browsers without
 * createImageBitmap (older Safari).
 */
export async function prepareFromFile(file: File): Promise<PreparedImage> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    const s = scaleFor(bitmap.width, bitmap.height);
    canvas.width = Math.round(bitmap.width * s);
    canvas.height = Math.round(bitmap.height * s);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return encode(canvas);
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    const s = scaleFor(img.naturalWidth, img.naturalHeight);
    canvas.width = Math.round(img.naturalWidth * s);
    canvas.height = Math.round(img.naturalHeight * s);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return encode(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
