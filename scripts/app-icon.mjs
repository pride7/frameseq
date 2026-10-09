import { deflateSync } from "node:zlib";

/**
 * The FrameSeq mark as the icon files a shortcut needs, drawn here rather than shipped as
 * binaries. The mark is a rounded square with an F made of three rectangles, on a 64-unit grid,
 * the same shapes as public/favicon.svg.
 */

const corner = 14;
const background = [0x02, 0x06, 0x17];
const foreground = [0x22, 0xd3, 0xee];
const letter = [
  [15, 15, 50, 24],
  [15, 15, 25, 58],
  [25, 32, 46, 41],
];

function insideSquare(x, y) {
  const cx = Math.min(Math.max(x, corner), 64 - corner);
  const cy = Math.min(Math.max(y, corner), 64 - corner);
  return (x - cx) ** 2 + (y - cy) ** 2 <= corner ** 2 && x >= 0 && x <= 64 && y >= 0 && y <= 64;
}

const insideLetter = (x, y) => letter.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);

/** The mark as straight RGBA pixels, each averaged over a grid of samples for smooth edges. */
function pixels(size) {
  const data = Buffer.alloc(size * size * 4);
  const samples = size <= 32 ? 8 : 4;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let alpha = 0;
      const color = [0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = ((px + (sx + 0.5) / samples) / size) * 64;
          const y = ((py + (sy + 0.5) / samples) / size) * 64;
          if (!insideSquare(x, y)) continue;
          const paint = insideLetter(x, y) ? foreground : background;
          alpha += 1;
          for (let channel = 0; channel < 3; channel += 1) color[channel] += paint[channel];
        }
      }
      const offset = (py * size + px) * 4;
      if (alpha > 0) {
        for (let channel = 0; channel < 3; channel += 1) data[offset + channel] = Math.round(color[channel] / alpha);
      }
      data[offset + 3] = Math.round((alpha / (samples * samples)) * 255);
    }
  }
  return data;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** The mark as a PNG of `size` pixels square. */
export function iconPng(size) {
  const rgba = pixels(size);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    rows[row * (size * 4 + 1)] = 0;
    rgba.copy(rows, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A Windows icon holding the mark at the sizes Explorer and the taskbar ask for, as PNGs. */
export function iconIco(sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map((size) => ({ size, png: iconPng(size) }));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

/** A macOS icon holding the mark as PNGs, from the Finder's smallest size to Retina's largest. */
export function iconIcns() {
  const entries = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512]]
    .map(([type, size]) => {
      const png = iconPng(size);
      const head = Buffer.alloc(8);
      head.write(type, 0, "ascii");
      head.writeUInt32BE(png.length + 8, 4);
      return Buffer.concat([head, png]);
    });
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + entries.reduce((total, entry) => total + entry.length, 0), 4);
  return Buffer.concat([head, ...entries]);
}
