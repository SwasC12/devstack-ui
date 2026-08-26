// Client-side image compression for uploads: downscale + WebP re-encode so
// Cloudinary storage doesn't fill up with multi-MB phone photos. Fully
// invisible to the user - no dialogs, no size choices, no friction.
//
// Rules:
//  - Files already under budget pass through 100% untouched (zero degradation).
//  - Photos/screenshots get downscaled to a max long edge and re-encoded as
//    WebP (visually lossless at these sizes; 20-60x smaller than originals).
//  - Animated GIFs are never touched; unsupported formats (e.g. HEIC) fall
//    back to the original so an upload never breaks because of compression.
//  - Bonus: re-encoding strips EXIF, so GPS location data leaves the photo.

const MAX_BYTES = 500 * 1024; // per-image budget
const MAX_DIM = 1920; // max long edge in px - plenty for menu screens
const FALLBACK_DIM = 1280; // tighter edge if the budget is still exceeded

export async function compressImage(file: File): Promise<File> {
  // Fast path: already small enough - upload as-is.
  if (file.size <= MAX_BYTES) return file;

  // Only raster image formats are worth re-encoding. Keep animations intact.
  const type = (file.type || '').toLowerCase();
  if (type === 'image/gif') return file;
  if (type && !/^image\/(jpeg|png|webp|bmp|avif)$/.test(type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      return await encodeToBudget(file, bitmap);
    } finally {
      bitmap.close();
    }
  } catch {
    return file; // decode failure (HEIC, corrupt file) - upload original
  }
}

async function encodeToBudget(original: File, bitmap: ImageBitmap): Promise<File> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;

  let best: Blob | null = null;
  let bestSize = Number.MAX_SAFE_INTEGER;

  // Try progressively: same size at lower quality, then smaller size.
  const attempts: Array<[number, number]> = [
    [MAX_DIM, 0.85],
    [MAX_DIM, 0.75],
    [MAX_DIM, 0.6],
    [FALLBACK_DIM, 0.85],
    [FALLBACK_DIM, 0.75],
  ];

  for (const [dim, quality] of attempts) {
    const d = scaledDims(bitmap.width, bitmap.height, dim);
    if (d.width !== canvas.width || d.height !== canvas.height) {
      canvas.width = d.width;
      canvas.height = d.height;
      ctx.drawImage(bitmap, 0, 0, d.width, d.height);
    }
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) continue;
    if (blob.size < bestSize) {
      best = blob;
      bestSize = blob.size;
    }
    if (blob.size <= MAX_BYTES) break;
  }

  if (!best || bestSize >= original.size) return original; // never make it worse
  const base = original.name.replace(/\.[^.]+$/, '');
  return new File([best], `${base}.webp`, { type: 'image/webp' });
}

// Center-crop an image to a target aspect ratio (width/height, e.g. 1 for 1:1,
// 4/3 for 4:3) and downscale to maxWidth, re-encoding as WebP. Used to give menu
// photos a consistent shape. Returns the original on unsupported formats/decode
// failure so an upload never breaks.
export async function cropToAspect(file: File, aspect: number, maxWidth = 1080): Promise<File> {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/gif') return file;
  if (type && !/^image\/(jpeg|png|webp|bmp|avif)$/.test(type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const cur = bitmap.width / bitmap.height;
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
      if (cur > aspect) { sw = Math.round(bitmap.height * aspect); sx = Math.round((bitmap.width - sw) / 2); }
      else { sh = Math.round(bitmap.width / aspect); sy = Math.round((bitmap.height - sh) / 2); }
      const tw = Math.min(maxWidth, sw);
      const th = Math.round(tw / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, tw, th);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
      if (!blob) return file;
      const base = file.name.replace(/\.[^.]+$/, '');
      return new File([blob], `${base}.webp`, { type: 'image/webp' });
    } finally { bitmap.close(); }
  } catch { return file; }
}

function scaledDims(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}
