/**
 * A picked picture made small enough to keep in the till's database: scaled to fit `max` px on
 * its longer side and encoded as WebP (JPEG if WebP is unavailable). Typically 10–40 KB.
 * Main still checks the result (service-handlers.ts `serviceImage`).
 */
export async function imageFileToDataUrl(file: File, max = 256): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) throw new Error('errors.invalidImage');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('errors.invalidImage');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const webp = canvas.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}
