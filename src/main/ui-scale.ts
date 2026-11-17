import fs from 'node:fs';
import path from 'node:path';

/**
 * The till's UI scale (v2.6.1): the whole page is zoomed to the window, so fonts, spacing, icons
 * and grids grow together on a big screen. The pages are laid out for about 1536 x 864 CSS px (a
 * laptop); a maximised Full HD monoblock (23.8", 1920 x 1080, Windows at 100 %) is shown at about
 * 115 %. Windows' own display scaling is already in the window size (DIPs), so a PC set to 125 %
 * gets 100 % here. Auto never goes below 100 % (the look the pages were made at); a person may
 * still pick 90 % in Settings → General. The choice is per PC (userData/ui-scale.json), never in
 * the clinic database: a satellite is another screen. Electron-free, so tests run it.
 */

export const BASE_WIDTH = 1536;
export const BASE_HEIGHT = 864;
export const AUTO_MIN = 1;
export const AUTO_MAX = 1.4;
export const MANUAL_SCALES = [0.9, 1, 1.1, 1.15, 1.25, 1.35, 1.5] as const;

export type UiScaleChoice = 'auto' | number;

/** The zoom factor for a window content size (DIPs), in 5 % steps, rounded down. */
export function autoScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const raw = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
  const stepped = Math.floor(raw * 20 + 1e-9) / 20;
  return Math.min(AUTO_MAX, Math.max(AUTO_MIN, stepped));
}

export function isUiScaleChoice(v: unknown): v is UiScaleChoice {
  return (
    v === 'auto' || (typeof v === 'number' && (MANUAL_SCALES as readonly number[]).includes(v))
  );
}

export function effectiveScale(choice: UiScaleChoice, width: number, height: number): number {
  return choice === 'auto' ? autoScale(width, height) : choice;
}

/** The saved choice in `file`; 'auto' when none, unreadable or not one of the offered values. */
export function readUiScale(file: string): UiScaleChoice {
  try {
    const v = (JSON.parse(fs.readFileSync(file, 'utf8')) as { scale?: unknown }).scale;
    return isUiScaleChoice(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeUiScale(file: string, choice: UiScaleChoice): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ scale: choice }));
}
