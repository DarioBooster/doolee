import zlib from 'node:zlib';
import type { FrameShape } from './types.ts';

export interface InspectedImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

const MAX_DIMENSION = 24000;

function isValidDims(w: number, h: number): boolean {
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w <= MAX_DIMENSION && h <= MAX_DIMENSION;
}

/**
 * Inspects raw binary bytes (magic numbers + structural headers) to verify
 * that a buffer is a genuine, non-corrupted PNG, JPEG, or WebP image.
 * Never trusts file extensions or HTTP Content-Type headers.
 */
export function inspectImageBuffer(buffer: Buffer): InspectedImage | null {
  if (!buffer || buffer.length < 24) {
    return null;
  }

  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (isPng) {
    // Walk PNG chunks starting at offset 8 to find IHDR (even if preceded by non-standard chunks)
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const chunkLen = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
      if (chunkType === 'IHDR' && offset + 16 <= buffer.length) {
        const width = buffer.readUInt32BE(offset + 8);
        const height = buffer.readUInt32BE(offset + 12);
        if (!isValidDims(width, height)) {
          return null;
        }
        return {
          mimeType: 'image/png',
          extension: 'png',
          width,
          height,
        };
      }
      const nextOffset = offset + 12 + chunkLen;
      if (nextOffset <= offset || nextOffset > buffer.length) break;
      offset = nextOffset;
    }
    return null;
  }

  // JPEG magic: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset += 1;
      }
      if (offset >= buffer.length) break;

      const marker = buffer[offset];
      offset += 1;

      // Markers without payload (SOI, EOI, RST0..RST7, TEM)
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        continue;
      }
      // Stop at Start of Scan (image payload begins)
      if (marker === 0xda) {
        break;
      }

      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) {
        break;
      }

      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && segmentLength >= 7) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        if (isValidDims(width, height)) {
          return {
            mimeType: 'image/jpeg',
            extension: 'jpg',
            width,
            height,
          };
        }
      }

      offset += segmentLength;
    }

    // Fallback scan for SOF0/SOF2 if quirky APP/EXIF segments shifted segment lengths
    for (let i = 2; i + 9 < buffer.length; i++) {
      if (buffer[i] === 0xff && (buffer[i + 1] === 0xc0 || buffer[i + 1] === 0xc2)) {
        const segLen = buffer.readUInt16BE(i + 2);
        const precision = buffer[i + 4];
        if (segLen >= 8 && segLen <= 64 && (precision === 8 || precision === 12)) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          if (isValidDims(width, height)) {
            return {
              mimeType: 'image/jpeg',
              extension: 'jpg',
              width,
              height,
            };
          }
        }
      }
    }
    return null;
  }

  // WebP magic: RIFF....WEBP
  const isWebp =
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (isWebp) {
    const chunkHeader = buffer.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8X' && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      if (isValidDims(width, height)) {
        return { mimeType: 'image/webp', extension: 'webp', width, height };
      }
    } else if (chunkHeader === 'VP8 ' && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (isValidDims(width, height)) {
        return { mimeType: 'image/webp', extension: 'webp', width, height };
      }
    } else if (chunkHeader === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      if (isValidDims(width, height)) {
        return { mimeType: 'image/webp', extension: 'webp', width, height };
      }
    }
    return null;
  }

  return null;
}

// ============================================================================
// Pure-Node PNG Generator for Starter Event Badge Templates (1080x1080 RGBA)
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Clean geometric stroke font for crisp vector-drawn badge headings
type StrokeSeg = [number, number, number, number];
const GLYPHS: Record<string, StrokeSeg[]> = {
  A: [[0, 1, 0.5, 0], [0.5, 0, 1, 1], [0.18, 0.65, 0.82, 0.65]],
  B: [[0, 0, 0, 1], [0, 0, 0.72, 0], [0.72, 0, 0.9, 0.14], [0.9, 0.14, 0.9, 0.34], [0.9, 0.34, 0.72, 0.48], [0, 0.48, 0.78, 0.48], [0.78, 0.48, 0.95, 0.62], [0.95, 0.62, 0.95, 0.85], [0.95, 0.85, 0.75, 1], [0.75, 1, 0, 1]],
  C: [[0.9, 0.18, 0.68, 0], [0.68, 0, 0.25, 0], [0.25, 0, 0.05, 0.22], [0.05, 0.22, 0.05, 0.78], [0.05, 0.78, 0.25, 1], [0.25, 1, 0.68, 1], [0.68, 1, 0.9, 0.82]],
  D: [[0, 0, 0, 1], [0, 0, 0.62, 0], [0.62, 0, 0.92, 0.25], [0.92, 0.25, 0.92, 0.75], [0.92, 0.75, 0.62, 1], [0.62, 1, 0, 1]],
  E: [[0.9, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0.9, 1], [0, 0.5, 0.72, 0.5]],
  É: [[0.9, 0.15, 0, 0.15], [0, 0.15, 0, 1], [0, 1, 0.9, 1], [0, 0.57, 0.72, 0.57], [0.32, 0.02, 0.68, -0.14]],
  F: [[0.9, 0, 0, 0], [0, 0, 0, 1], [0, 0.5, 0.72, 0.5]],
  G: [[0.88, 0.18, 0.65, 0], [0.65, 0, 0.25, 0], [0.25, 0, 0.05, 0.22], [0.05, 0.22, 0.05, 0.78], [0.05, 0.78, 0.25, 1], [0.25, 1, 0.75, 1], [0.75, 1, 0.92, 0.82], [0.92, 0.82, 0.92, 0.54], [0.92, 0.54, 0.54, 0.54]],
  H: [[0.08, 0, 0.08, 1], [0.92, 0, 0.92, 1], [0.08, 0.5, 0.92, 0.5]],
  I: [[0.25, 0, 0.75, 0], [0.5, 0, 0.5, 1], [0.25, 1, 0.75, 1]],
  J: [[0.25, 0, 0.85, 0], [0.75, 0, 0.75, 0.78], [0.75, 0.78, 0.55, 1], [0.55, 1, 0.22, 1], [0.22, 1, 0.05, 0.8]],
  L: [[0.1, 0, 0.1, 1], [0.1, 1, 0.9, 1]],
  M: [[0.05, 1, 0.05, 0], [0.05, 0, 0.5, 0.55], [0.5, 0.55, 0.95, 0], [0.95, 0, 0.95, 1]],
  N: [[0.08, 1, 0.08, 0], [0.08, 0, 0.92, 1], [0.92, 1, 0.92, 0]],
  O: [[0.5, 0, 0.82, 0.08], [0.82, 0.08, 0.95, 0.35], [0.95, 0.35, 0.95, 0.65], [0.95, 0.65, 0.82, 0.92], [0.82, 0.92, 0.5, 1], [0.5, 1, 0.18, 0.92], [0.18, 0.92, 0.05, 0.65], [0.05, 0.65, 0.05, 0.35], [0.05, 0.35, 0.18, 0.08], [0.18, 0.08, 0.5, 0]],
  P: [[0.08, 1, 0.08, 0], [0.08, 0, 0.7, 0], [0.7, 0, 0.92, 0.14], [0.92, 0.14, 0.92, 0.38], [0.92, 0.38, 0.7, 0.52], [0.7, 0.52, 0.08, 0.52]],
  R: [[0.08, 1, 0.08, 0], [0.08, 0, 0.7, 0], [0.7, 0, 0.9, 0.14], [0.9, 0.14, 0.9, 0.38], [0.9, 0.38, 0.7, 0.52], [0.7, 0.52, 0.08, 0.52], [0.52, 0.52, 0.92, 1]],
  S: [[0.86, 0.16, 0.66, 0], [0.66, 0, 0.28, 0], [0.28, 0, 0.08, 0.16], [0.08, 0.16, 0.08, 0.34], [0.08, 0.34, 0.25, 0.46], [0.25, 0.46, 0.75, 0.54], [0.75, 0.54, 0.92, 0.68], [0.92, 0.68, 0.92, 0.84], [0.92, 0.84, 0.72, 1], [0.72, 1, 0.26, 1], [0.26, 1, 0.08, 0.84]],
  T: [[0.05, 0, 0.95, 0], [0.5, 0, 0.5, 1]],
  U: [[0.08, 0, 0.08, 0.76], [0.08, 0.76, 0.28, 1], [0.28, 1, 0.72, 1], [0.72, 1, 0.92, 0.76], [0.92, 0.76, 0.92, 0]],
  V: [[0.05, 0, 0.5, 1], [0.5, 1, 0.95, 0]],
  Y: [[0.05, 0, 0.5, 0.52], [0.95, 0, 0.5, 0.52], [0.5, 0.52, 0.5, 1]],
  "'": [[0.5, 0, 0.42, 0.25]],
  ' ': [],
  '-': [[0.2, 0.5, 0.8, 0.5]],
  '2': [[0.12, 0.2, 0.35, 0], [0.35, 0, 0.72, 0], [0.72, 0, 0.9, 0.2], [0.9, 0.2, 0.85, 0.42], [0.85, 0.42, 0.1, 1], [0.1, 1, 0.92, 1]],
  '0': [[0.5, 0, 0.82, 0.08], [0.82, 0.08, 0.92, 0.35], [0.92, 0.35, 0.92, 0.65], [0.92, 0.65, 0.82, 0.92], [0.82, 0.92, 0.5, 1], [0.5, 1, 0.18, 0.92], [0.18, 0.92, 0.08, 0.65], [0.08, 0.65, 0.08, 0.35], [0.08, 0.35, 0.18, 0.08], [0.18, 0.08, 0.5, 0]],
  '6': [[0.82, 0.12, 0.55, 0], [0.55, 0, 0.25, 0.08], [0.25, 0.08, 0.08, 0.36], [0.08, 0.36, 0.08, 0.78], [0.08, 0.78, 0.28, 1], [0.28, 1, 0.72, 1], [0.72, 1, 0.92, 0.8], [0.92, 0.8, 0.92, 0.58], [0.92, 0.58, 0.72, 0.44], [0.72, 0.44, 0.25, 0.44], [0.25, 0.44, 0.08, 0.6]],
};

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function blendPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  if (a <= 0) return;
  const idx = (y * width + x) * 4;
  const sa = a;
  const da = rgba[idx + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  rgba[idx] = Math.round((r * sa + rgba[idx] * da * (1 - sa)) / outA);
  rgba[idx + 1] = Math.round((g * sa + rgba[idx + 1] * da * (1 - sa)) / outA);
  rgba[idx + 2] = Math.round((b * sa + rgba[idx + 2] * da * (1 - sa)) / outA);
  rgba[idx + 3] = Math.round(outA * 255);
}

function drawCapsule(
  rgba: Uint8Array,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  color: [number, number, number]
): void {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 2));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x1, x2) + radius + 2));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 2));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y1, y2) + radius + 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = distToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2);
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - d));
      if (coverage > 0) {
        blendPixel(rgba, width, x, y, color[0], color[1], color[2], coverage);
      }
    }
  }
}

function drawCenteredText(
  rgba: Uint8Array,
  canvasW: number,
  canvasH: number,
  text: string,
  centerY: number,
  charHeight: number,
  strokeRadius: number,
  color: [number, number, number]
): void {
  const chars = Array.from(text);
  const charW = charHeight * 0.62;
  const gap = charHeight * 0.24;
  const totalW = chars.reduce((acc, ch, i) => {
    const w = ch === ' ' ? charW * 0.55 : ch === "'" ? charW * 0.35 : charW;
    return acc + w + (i < chars.length - 1 ? gap : 0);
  }, 0);

  let cursorX = (canvasW - totalW) / 2;
  const topY = centerY - charHeight / 2;

  for (const ch of chars) {
    const w = ch === ' ' ? charW * 0.55 : ch === "'" ? charW * 0.35 : charW;
    const segs = GLYPHS[ch] ?? [];
    for (const [x1, y1, x2, y2] of segs) {
      drawCapsule(
        rgba,
        canvasW,
        canvasH,
        cursorX + x1 * w,
        topY + y1 * charHeight,
        cursorX + x2 * w,
        topY + y2 * charHeight,
        strokeRadius,
        color
      );
    }
    cursorX += w + gap;
  }
}

export interface StarterTemplateSpec {
  id: string;
  name: string;
  headline: string;
  subline: string;
  primaryRgb: [number, number, number];
  accentRgb: [number, number, number];
  frameShape: FrameShape;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
}

export const STARTER_TEMPLATE_SPECS: StarterTemplateSpec[] = [
  {
    id: 'starter-jy-serai',
    name: "J'y serai — Sommet 2026",
    headline: "J'Y SERAI",
    subline: 'SOMMET INNOVATION 2026',
    primaryRgb: [15, 118, 110], // Deep Teal #0F766E
    accentRgb: [15, 23, 42], // Slate 900 #0F172A
    frameShape: 'circle',
    frameX: 240,
    frameY: 220,
    frameWidth: 600,
    frameHeight: 600,
  },
  {
    id: 'starter-jy-etais',
    name: "J'y étais — Édition Annuelle",
    headline: "J'Y ÉTAIS",
    subline: 'RENCONTRE ANNUELLE 2026',
    primaryRgb: [15, 23, 42], // Slate 900
    accentRgb: [217, 119, 6], // Amber 600 #D97706
    frameShape: 'rounded',
    frameX: 165,
    frameY: 195,
    frameWidth: 750,
    frameHeight: 640,
  },
  {
    id: 'starter-je-participe',
    name: 'Je participe — Forum Ouvert',
    headline: 'JE PARTICIPE',
    subline: 'FORUM COLLABORATIF 2026',
    primaryRgb: [30, 64, 175], // Deep Cobalt #1E40AF
    accentRgb: [15, 118, 110], // Teal
    frameShape: 'rect',
    frameX: 140,
    frameY: 185,
    frameWidth: 800,
    frameHeight: 650,
  },
];

function sdfRoundedBox(px: number, py: number, cx: number, cy: number, halfW: number, halfH: number, r: number): number {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

export function generateStarterTemplatePng(spec: StarterTemplateSpec): {
  buffer: Buffer;
  width: number;
  height: number;
} {
  const width = 1080;
  const height = 1080;
  const rgba = new Uint8Array(width * height * 4);

  const cx = spec.frameX + spec.frameWidth / 2;
  const cy = spec.frameY + spec.frameHeight / 2;
  const halfW = spec.frameWidth / 2;
  const halfH = spec.frameHeight / 2;
  const cornerR = spec.frameShape === 'circle' ? Math.min(halfW, halfH) : spec.frameShape === 'rounded' ? 48 : 0;

  const [pr, pg, pb] = spec.primaryRgb;
  const [ar, ag, ab] = spec.accentRgb;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      // Distance to photo cutout (negative inside cutout, positive outside)
      let dCutout: number;
      if (spec.frameShape === 'circle') {
        dCutout = Math.hypot(px - cx, py - cy) - Math.min(halfW, halfH);
      } else {
        dCutout = sdfRoundedBox(px, py, cx, cy, halfW, halfH, cornerR);
      }

      // Outer badge frame background: crisp off-white paper with clean geometric bands
      let r = 248;
      let g = 250;
      let b = 252;

      // Top editorial header band
      if (y < 130) {
        r = pr;
        g = pg;
        b = pb;
      } else if (y < 140) {
        r = ar;
        g = ag;
        b = ab;
      } else if (y >= 885 && y < 893) {
        r = ar;
        g = ag;
        b = ab;
      } else if (y >= 893) {
        r = pr;
        g = pg;
        b = pb;
      } else {
        // Subtle architectural side margin lines
        if (x < 32 || x >= width - 32) {
          r = pr;
          g = pg;
          b = pb;
        }
      }

      // Crisp border ring around photo cutout
      if (dCutout >= 0 && dCutout <= 10) {
        const ringMix = Math.max(0, Math.min(1, 1 - Math.abs(dCutout - 5) / 5));
        r = Math.round(r * (1 - ringMix) + pr * ringMix);
        g = Math.round(g * (1 - ringMix) + pg * ringMix);
        b = Math.round(b * (1 - ringMix) + pb * ringMix);
      }

      // Anti-aliased alpha around transparent cutout
      const alpha = Math.max(0, Math.min(1, dCutout + 0.5));
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = Math.round(alpha * 255);
    }
  }

  // Draw crisp vector-stroked typography in top and bottom bands
  drawCenteredText(rgba, width, height, spec.subline, 66, 36, 4.2, [255, 255, 255]);
  drawCenteredText(rgba, width, height, spec.headline, 985, 76, 8.2, [255, 255, 255]);

  return {
    buffer: encodeRgbaPng(width, height, rgba),
    width,
    height,
  };
}
