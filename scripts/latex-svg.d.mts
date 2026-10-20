export function xdvToSvg(
  xdv: Buffer,
  loadFont: (name: string) => Promise<Buffer>,
  prefix: string,
): Promise<{ svg: string; width: number; height: number }>;
