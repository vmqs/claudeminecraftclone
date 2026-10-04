const f = Math.fround;

/** java.awt.Color.HSBtoRGB: hue wraps around 1; the result is 0xFFRRGGBB with float rounding. */
export function hsbToRgb(hue: number, saturation: number, brightness: number): number {
  const to8 = (v: number) => Math.trunc(f(f(v * 255) + 0.5));
  if (saturation === 0) {
    const c = to8(brightness);
    return (0xff000000 | (c << 16) | (c << 8) | c) | 0;
  }
  const h = f(f(hue - f(Math.floor(hue))) * 6);
  const frac = f(h - f(Math.floor(h)));
  const p = f(brightness * f(1 - saturation));
  const q = f(brightness * f(1 - f(saturation * frac)));
  const t = f(brightness * f(1 - f(saturation * f(1 - frac))));
  const [r, g, b] = [
    [brightness, t, p],
    [q, brightness, p],
    [p, brightness, t],
    [p, q, brightness],
    [t, p, brightness],
    [brightness, p, q],
  ][Math.trunc(h)] ?? [0, 0, 0];
  return (0xff000000 | (to8(r) << 16) | (to8(g) << 8) | to8(b)) | 0;
}
