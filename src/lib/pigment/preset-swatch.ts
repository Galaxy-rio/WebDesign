/** Keep the palette fill and its selection ring in separate vector shapes. */
export function presetSwatch(colors: string[]): string {
  const palette = colors.filter(color => /^#[0-9a-f]{6}$/i.test(color));
  if (!palette.length) palette.push('#808080');
  const radius = 45;
  const point = (angle: number) => {
    const radians = angle * Math.PI / 180;
    return `${(50 + radius * Math.sin(radians)).toFixed(4)} ${(50 - radius * Math.cos(radians)).toFixed(4)}`;
  };
  // A complete base circle prevents transparent seams between adjacent sectors.
  const sectors = palette.slice(1).map((color, index) => {
    const start = (index + 1) * 360 / palette.length;
    const end = (index + 2) * 360 / palette.length;
    return `<path fill="${color}" d="M50 50L${point(start)}A${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)}Z"/>`;
  }).join('');
  return `<svg class="preset-colours" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="50" r="${radius}" fill="${palette[0]}"/>${sectors}<circle class="preset-rim" cx="50" cy="50" r="48" fill="none"/></svg>`;
}
