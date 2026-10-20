// Turns the XDV page that Tectonic writes for a LaTeX fragment into one SVG.
//
// XDV is XeTeX's DVI: glyph runs in OpenType fonts, rules, and specials, at positions in scaled
// points. Glyphs become paths drawn from the fonts' own outlines, so the result needs no font
// files. Colours come from the colour stack specials, and TikZ draws through its dvisvgm driver,
// whose specials carry SVG markup that goes into the output as written, as dvisvgm would put it.

// opentype.js ships inside FrameSeq rather than as a dependency, so an installed app takes this
// version as an update without installing anything.
import { parse as parseFont } from "./vendor/opentype.mjs";

const inch = 72;
// TeX points per big point, the SVG user unit.
const ptPerBp = 72.27 / 72;

const round = (value) => Number(value.toFixed(3));

function cssColor(model, values) {
  const channel = (value) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  let rgb;
  if (model === "gray") rgb = [values[0], values[0], values[0]];
  else if (model === "rgb") rgb = values.slice(0, 3);
  else if (model === "cmyk") {
    const [c, m, y, k] = values;
    rgb = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
  } else return undefined;
  if (rgb.some((value) => !Number.isFinite(value))) return undefined;
  // Black stays the slide's foreground colour, so a fragment reads on a dark theme too.
  if (rgb.every((value) => value === 0)) return "currentColor";
  return `#${rgb.map((value) => channel(value).toString(16).padStart(2, "0")).join("")}`;
}

// "color push rgb 1 0 0", "color push gray 0.5", or a named colour such as "color push Black".
function pushedColor(special) {
  const [model, ...rest] = special.trim().split(/\s+/);
  const values = rest.map(Number);
  // A named colour other than these models is rare enough to draw in the foreground colour.
  return cssColor(model.toLowerCase(), values) ?? "currentColor";
}

// TikZ writes black as "#000" or "black"; those follow the slide's foreground colour as well.
function themeBlack(markup) {
  return markup.replace(/(\b(?:fill|stroke)=")(?:#000|#000000|black)"/g, "$1currentColor\"");
}

class Reader {
  constructor(data) {
    this.data = data;
    this.offset = 0;
  }
  get done() {
    return this.offset >= this.data.length;
  }
  unsigned(bytes) {
    let value = 0;
    for (let index = 0; index < bytes; index++) value = value * 256 + this.data[this.offset++];
    return value;
  }
  signed(bytes) {
    const value = this.unsigned(bytes);
    const limit = 2 ** (8 * bytes - 1);
    return value >= limit ? value - 2 * limit : value;
  }
  text(length) {
    const value = this.data.subarray(this.offset, this.offset + length).toString("utf8");
    this.offset += length;
    return value;
  }
  skip(bytes) {
    this.offset += bytes;
  }
}

/**
 * Convert one XDV page to SVG markup.
 * @param {Buffer} xdv The XDV file Tectonic wrote.
 * @param {(name: string) => Promise<Buffer>} loadFont Reads a font file by the name XDV gives it.
 * @param {string} prefix Makes every id in the SVG unique on a page with other fragments.
 * @returns {Promise<{ svg: string, width: number, height: number }>}
 */
export async function xdvToSvg(xdv, loadFont, prefix) {
  const reader = new Reader(xdv);
  let bpPerUnit = 0;
  let pageWidth = 0;
  let pageHeight = 0;
  const fonts = new Map();
  const glyphPaths = new Map();
  const defs = [];
  const rawSets = new Map();
  const placedSets = new Set();
  const body = [];
  const colors = [];
  let rawSet;
  let font;
  let h = 0, v = 0, w = 0, x = 0, y = 0, z = 0;
  const stack = [];

  const svgX = (units) => units * bpPerUnit + inch;
  const svgY = (units) => units * bpPerUnit + inch;
  const color = () => colors.at(-1) ?? "currentColor";

  const defineFont = async (id, name, size, extend, slant) => {
    if (fonts.has(id)) return;
    const file = name.replace(/^\[|\]$/g, "").replace(/^.*[\\/]/, "");
    let data;
    try {
      data = await loadFont(file);
    } catch (error) {
      throw new Error(`Could not read the font ${file}: ${error instanceof Error ? error.message : error}`);
    }
    const parsed = parseFont(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    fonts.set(id, { key: file, font: parsed, size: size * bpPerUnit, extend, slant });
  };

  const glyph = (id) => {
    const key = `${font.key}:${id}`;
    let ref = glyphPaths.get(key);
    if (!ref) {
      ref = `${prefix}g${glyphPaths.size}`;
      glyphPaths.set(key, ref);
      const units = font.font.unitsPerEm;
      const path = font.font.glyphs.get(id).getPath(0, 0, units).toPathData(1);
      defs.push(`<path id="${ref}" d="${path}"/>`);
    }
    return ref;
  };

  const drawGlyph = (id, px, py) => {
    if (!font) throw new Error("The LaTeX output drew a glyph before choosing a font");
    const scale = font.size / font.font.unitsPerEm;
    const a = round(scale * font.extend);
    const c = round(-scale * font.slant);
    const d = round(scale);
    body.push(`<use href="#${glyph(id)}" transform="matrix(${a} 0 ${c} ${d} ${round(svgX(px))} ${round(svgY(py))})" fill="${color()}"/>`);
  };

  const drawRule = (height, width) => {
    if (height <= 0 || width <= 0) return;
    body.push(`<rect x="${round(svgX(h))}" y="${round(svgY(v - height))}" width="${round(width * bpPerUnit)}" height="${round(height * bpPerUnit)}" fill="${color()}"/>`);
  };

  const raw = (markup) => markup
    .replaceAll("{?nl}", "\n")
    .replaceAll("{?x}", String(round(svgX(h))))
    .replaceAll("{?y}", String(round(svgY(v))));

  const special = (text) => {
    if (text.startsWith("color push")) colors.push(pushedColor(text.slice(10)));
    else if (text.startsWith("color pop")) colors.pop();
    else if (text.startsWith("pdf:pagesize")) {
      const width = text.match(/width\s+([\d.]+)pt/)?.[1];
      const height = text.match(/height\s+([\d.]+)pt/)?.[1];
      if (width) pageWidth = Number(width) / ptPerBp;
      if (height) pageHeight = Number(height) / ptPerBp;
    } else if (text.startsWith("dvisvgm:rawset")) {
      rawSet = text.slice(14).trim();
      rawSets.set(rawSet, []);
    } else if (text.startsWith("dvisvgm:endrawset")) rawSet = undefined;
    else if (text.startsWith("dvisvgm:rawdef")) {
      const markup = raw(text.slice(14).trimStart());
      if (rawSet) rawSets.get(rawSet).push(markup);
      else defs.push(markup);
    } else if (text.startsWith("dvisvgm:rawput")) {
      const name = text.slice(14).trim();
      if (!placedSets.has(name)) {
        placedSets.add(name);
        defs.push(...(rawSets.get(name) ?? []));
      }
    } else if (text.startsWith("dvisvgm:raw")) {
      const markup = raw(text.slice(11).trimStart());
      if (rawSet) rawSets.get(rawSet).push(markup);
      else body.push(markup);
    }
    // Other specials, such as dvisvgm:bbox and pdfcolorstackinit, change nothing drawn here.
  };

  while (!reader.done) {
    const opcode = reader.unsigned(1);
    if (opcode < 128) throw new Error("The LaTeX output uses a TeX font without an OpenType file; load an OpenType font for it");
    if (opcode >= 171 && opcode <= 234) {
      font = fonts.get(opcode - 171);
      continue;
    }
    switch (opcode) {
      case 128: case 129: case 130: case 131:
      case 133: case 134: case 135: case 136:
        throw new Error("The LaTeX output uses a TeX font without an OpenType file; load an OpenType font for it");
      case 132: case 137: {
        const height = reader.signed(4);
        const width = reader.signed(4);
        drawRule(height, width);
        if (opcode === 132) h += width;
        break;
      }
      case 138: break;
      case 139:
        reader.skip(44);
        h = v = w = x = y = z = 0;
        stack.length = 0;
        break;
      case 140:
        // One page is all a fragment makes.
        reader.offset = reader.data.length;
        break;
      case 141: stack.push([h, v, w, x, y, z]); break;
      case 142: [h, v, w, x, y, z] = stack.pop(); break;
      case 143: case 144: case 145: case 146: h += reader.signed(opcode - 142); break;
      case 147: h += w; break;
      case 148: case 149: case 150: case 151: w = reader.signed(opcode - 147); h += w; break;
      case 152: h += x; break;
      case 153: case 154: case 155: case 156: x = reader.signed(opcode - 152); h += x; break;
      case 157: case 158: case 159: case 160: v += reader.signed(opcode - 156); break;
      case 161: v += y; break;
      case 162: case 163: case 164: case 165: y = reader.signed(opcode - 161); v += y; break;
      case 166: v += z; break;
      case 167: case 168: case 169: case 170: z = reader.signed(opcode - 166); v += z; break;
      case 235: case 236: case 237: case 238: font = fonts.get(reader.unsigned(opcode - 234)); break;
      case 239: case 240: case 241: case 242: special(reader.text(reader.unsigned(opcode - 238))); break;
      case 243: case 244: case 245: case 246: {
        reader.skip(opcode - 242 + 12);
        const length = reader.unsigned(1) + reader.unsigned(1);
        reader.skip(length);
        break;
      }
      case 247: {
        reader.skip(1);
        const numerator = reader.unsigned(4);
        const denominator = reader.unsigned(4);
        const magnification = reader.unsigned(4);
        reader.skip(reader.unsigned(1));
        // DVI units are numerator / denominator tenths of a micrometre; an inch is 254000.
        bpPerUnit = (numerator / denominator) * (magnification / 1000) * (inch / 254000);
        break;
      }
      case 252: {
        const id = reader.signed(4);
        const size = reader.unsigned(4);
        const flags = reader.unsigned(2);
        const name = reader.text(reader.unsigned(1));
        reader.skip(4);
        if (flags & 0x0200) reader.skip(4);
        const extend = flags & 0x1000 ? reader.signed(4) / 65536 : 1;
        const slant = flags & 0x2000 ? reader.signed(4) / 65536 : 0;
        if (flags & 0x4000) reader.skip(4);
        await defineFont(id, name, size, extend, slant);
        break;
      }
      case 253: case 254: {
        if (opcode === 254) reader.skip(2 * reader.unsigned(2));
        const width = reader.signed(4);
        const count = reader.unsigned(2);
        const positions = [];
        for (let index = 0; index < count; index++) positions.push([reader.signed(4), reader.signed(4)]);
        for (let index = 0; index < count; index++) {
          drawGlyph(reader.unsigned(2), h + positions[index][0], v + positions[index][1]);
        }
        h += width;
        break;
      }
      case 251:
        throw new Error("LaTeX fragments cannot place images with \\includegraphics yet; use image() beside the fragment");
      default:
        throw new Error(`The LaTeX output has an XDV instruction FrameSeq cannot read (${opcode})`);
    }
  }

  if (!(pageWidth > 0 && pageHeight > 0)) {
    throw new Error("Could not determine the dimensions of the compiled LaTeX fragment");
  }

  // TikZ names its markers, patterns, and gradients; each fragment's names are made its own.
  let markup = `<defs>${defs.join("")}</defs>${body.join("")}`;
  const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const id of ids) {
    if (id.startsWith(prefix)) continue;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    markup = markup
      .replace(new RegExp(`\\bid="${escaped}"`, "g"), `id="${prefix}${id}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, "g"), `url(#${prefix}${id})`)
      .replace(new RegExp(`href="#${escaped}"`, "g"), `href="#${prefix}${id}"`);
  }
  markup = themeBlack(markup);

  const width = round(pageWidth);
  const height = round(pageHeight);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Typeset LaTeX fragment" overflow="visible">${markup}</svg>`;
  return { svg, width, height };
}
