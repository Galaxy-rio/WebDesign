import { paletteLookup } from './renderer.ts';

/** Each draggable band owns a colour stop at its midpoint. */
export function balanceGradient(colors: string[], divisions: number[]): string {
  const bounds = [0, ...divisions, 1];
  const stops = colors.map((color, index) => `${color} ${(bounds[index] + bounds[index + 1]) * 50}%`);
  return `linear-gradient(90deg in oklab, ${stops.join(', ')})`;
}

/** The surrounding wallpaper depends on the palette, never the animation clock. */
export function backdropColours(colors: string[], divisions: number[]): string[] {
  return paletteLookup(colors, divisions, 6).map(rgb =>
    '#' + rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')
  );
}
