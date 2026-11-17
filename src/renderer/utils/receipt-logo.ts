import { LOGO_MAX_CHARS } from '../../shared/receipt-html';

/**
 * Prepares a picked image (logo / QR code) for a thermal receipt (SavdoChef utils/receipt-logo):
 * downscaled to the printer's resolution, flattened on white, PNG when it fits the budget and
 * JPEG otherwise. The result is a data URL kept in the clinic's receipt layout, which crosses the
 * LAN to satellites, so it stays small (`LOGO_MAX_CHARS`, checked in main too).
 */

/** 80 mm paper at 203 dpi is 576 dots: anything wider is wasted. */
const MAX_PX = 576;
const JPEG_QUALITY_STEPS = [0.9, 0.8, 0.7, 0.55, 0.4];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_LOGO_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

export class ReceiptLogoError extends Error {
  constructor(public readonly reason: 'type' | 'tooLarge' | 'decode') {
    super(reason);
    this.name = 'ReceiptLogoError';
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ReceiptLogoError('decode'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ReceiptLogoError('decode'));
    img.src = src;
  });
}

export async function prepareReceiptLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ReceiptLogoError('type');
  if (file.size > MAX_SOURCE_BYTES) throw new ReceiptLogoError('tooLarge');

  const img = await loadImage(await readAsDataURL(file));
  if (!img.naturalWidth || !img.naturalHeight) throw new ReceiptLogoError('decode');

  const scale = Math.min(1, MAX_PX / img.naturalWidth, MAX_PX / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ReceiptLogoError('decode');
  // Thermal paper is white and cannot print transparency: an alpha PNG would print black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const png = canvas.toDataURL('image/png');
  if (png.length <= LOGO_MAX_CHARS) return png;
  for (const quality of JPEG_QUALITY_STEPS) {
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    if (jpeg.length <= LOGO_MAX_CHARS) return jpeg;
  }
  throw new ReceiptLogoError('tooLarge');
}
