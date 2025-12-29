export function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  
  return [r, g, b];
}

export function isValidHexColor(hex: string): boolean {
  const hexColorRegex = /^#[0-9A-F]{6}$/i;
  return hexColorRegex.test(hex);
}
