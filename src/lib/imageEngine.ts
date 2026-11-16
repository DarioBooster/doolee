import type {
  FrameConfig,
  FrameShape,
  GeneratedBadge,
  PhotoAdjustment,
  SessionPhoto,
  TemplateDTO,
} from '../types/doolee.ts';
import { loadImageFromUrl } from './fileValidation.ts';

export const DEFAULT_ADJUSTMENT: PhotoAdjustment = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export interface PhotoDrawRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Computes exact destination rectangle for a photo inside a template frame,
 * preserving the photo's original aspect ratio (no stretching or distortion).
 * At scale = 1.0, the photo covers the entire frame ("object-cover" fit).
 */
export function computePhotoDrawRect(
  photoWidth: number,
  photoHeight: number,
  frame: Pick<FrameConfig, 'frame_x' | 'frame_y' | 'frame_width' | 'frame_height'>,
  adjustment: PhotoAdjustment
): PhotoDrawRect {
  const safeW = Math.max(1, photoWidth);
  const safeH = Math.max(1, photoHeight);
  const baseCoverScale = Math.max(frame.frame_width / safeW, frame.frame_height / safeH);
  const effectiveScale = baseCoverScale * Math.max(0.2, Math.min(5, adjustment.scale));

  const dw = safeW * effectiveScale;
  const dh = safeH * effectiveScale;
  const frameCenterX = frame.frame_x + frame.frame_width / 2;
  const frameCenterY = frame.frame_y + frame.frame_height / 2;

  const dx = frameCenterX - dw / 2 + adjustment.offsetX;
  const dy = frameCenterY - dh / 2 + adjustment.offsetY;

  return { dx, dy, dw, dh };
}

/**
 * Automatically inspects a template image's alpha channel using connected-component
 * analysis to locate an interior transparent photo cutout window (ignoring outer
 * transparent margins/rounded corners). Falls back to a centered frame with
 * layer_mode='front' when no interior transparent hole exists.
 */
export function detectTemplateFrame(
  img: HTMLImageElement,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
): FrameConfig {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const side = Math.round(Math.min(w, h) * 0.56);
  const fallback: FrameConfig = {
    frame_x: Math.round((w - side) / 2),
    frame_y: Math.round((h - side) / 2),
    frame_width: Math.max(1, side),
    frame_height: Math.max(1, side),
    frame_shape: 'rect',
    layer_mode: 'front',
  };

  if (mimeType !== 'image/png' && mimeType !== 'image/webp') {
    return fallback;
  }

  const maxSample = 320;
  const ratio = Math.min(1, maxSample / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * ratio));
  const sh = Math.max(1, Math.round(h * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return fallback;

  ctx.drawImage(img, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  const totalPixels = sw * sh;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);

  let bestArea = 0;
  let bestMinX = 0;
  let bestMinY = 0;
  let bestMaxX = 0;
  let bestMaxY = 0;

  for (let startY = 0; startY < sh; startY++) {
    for (let startX = 0; startX < sw; startX++) {
      const startIdx = startY * sw + startX;
      if (visited[startIdx]) continue;
      if (data[startIdx * 4 + 3] >= 128) continue;

      // BFS over connected transparent pixels
      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;

      let area = 0;
      let touchesBorder = false;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;

      while (head < tail) {
        const idx = queue[head++];
        const x = idx % sw;
        const y = (idx - x) / sw;
        area += 1;

        if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1) {
          touchesBorder = true;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // 4-connected neighbors
        if (x > 0) {
          const n = idx - 1;
          if (!visited[n] && data[n * 4 + 3] < 128) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (x < sw - 1) {
          const n = idx + 1;
          if (!visited[n] && data[n * 4 + 3] < 128) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (y > 0) {
          const n = idx - sw;
          if (!visited[n] && data[n * 4 + 3] < 128) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (y < sh - 1) {
          const n = idx + sw;
          if (!visited[n] && data[n * 4 + 3] < 128) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      // Only interior holes (not touching image outer edge) count as photo cutouts
      if (!touchesBorder && area > bestArea) {
        bestArea = area;
        bestMinX = minX;
        bestMinY = minY;
        bestMaxX = maxX;
        bestMaxY = maxY;
      }
    }
  }

  if (bestArea < totalPixels * 0.015 || bestMaxX <= bestMinX || bestMaxY <= bestMinY) {
    return fallback;
  }

  const bboxArea = (bestMaxX - bestMinX + 1) * (bestMaxY - bestMinY + 1);
  const fillRatio = bestArea / bboxArea;

  let detectedShape: FrameShape = 'rect';
  if (
    fillRatio >= 0.7 &&
    fillRatio <= 0.86 &&
    Math.abs((bestMaxX - bestMinX) - (bestMaxY - bestMinY)) <= Math.max(4, sw * 0.05)
  ) {
    detectedShape = 'circle';
  } else if (fillRatio >= 0.87 && fillRatio < 0.985) {
    detectedShape = 'rounded';
  }

  return {
    frame_x: Math.max(0, Math.round(bestMinX / ratio)),
    frame_y: Math.max(0, Math.round(bestMinY / ratio)),
    frame_width: Math.min(w, Math.max(1, Math.round((bestMaxX - bestMinX + 1) / ratio))),
    frame_height: Math.min(h, Math.max(1, Math.round((bestMaxY - bestMinY + 1) / ratio))),
    frame_shape: detectedShape,
    layer_mode: 'behind',
  };
}

/**
 * Generates an optimized downscaled thumbnail ObjectURL (max 240px)
 * to keep memory low in the photo gallery strip.
 */
export async function createThumbnailUrl(img: HTMLImageElement, maxDim = 240): Promise<string> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * ratio));
  const th = Math.max(1, Math.round(h * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossible de créer le contexte graphique pour la miniature.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(img, 0, 0, tw, th);

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  return URL.createObjectURL(blob);
}

export function traceFrameClipPath(
  ctx: CanvasRenderingContext2D,
  frame: Pick<FrameConfig, 'frame_x' | 'frame_y' | 'frame_width' | 'frame_height' | 'frame_shape'>
): void {
  const { frame_x, frame_y, frame_width, frame_height, frame_shape } = frame;
  ctx.beginPath();
  if (frame_shape === 'circle') {
    const cx = frame_x + frame_width / 2;
    const cy = frame_y + frame_height / 2;
    ctx.ellipse(cx, cy, frame_width / 2, frame_height / 2, 0, 0, Math.PI * 2);
  } else if (frame_shape === 'rounded') {
    const radius = Math.min(frame_width, frame_height) * 0.08;
    ctx.roundRect(frame_x, frame_y, frame_width, frame_height, radius);
  } else {
    ctx.rect(frame_x, frame_y, frame_width, frame_height);
  }
  ctx.closePath();
}

/**
 * Renders a composed badge (template + positioned user photo) onto any 2D canvas.
 * Preserves template proportions and supports both behind-cutout and front-overlay modes.
 */
export function renderBadgeToCanvas(
  ctx: CanvasRenderingContext2D,
  templateImg: HTMLImageElement,
  photoImg: HTMLImageElement | null,
  template: Pick<
    TemplateDTO,
    'width' | 'height' | 'frame_x' | 'frame_y' | 'frame_width' | 'frame_height' | 'frame_shape' | 'layer_mode'
  >,
  adjustment: PhotoAdjustment,
  outputWidth: number,
  outputHeight: number
): void {
  const scaleFactor = outputWidth / template.width;

  ctx.save();
  ctx.clearRect(0, 0, outputWidth, outputHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scaleFactor, scaleFactor);

  const drawClippedPhoto = () => {
    if (!photoImg) return;
    ctx.save();
    traceFrameClipPath(ctx, template);
    ctx.clip();
    const { dx, dy, dw, dh } = computePhotoDrawRect(
      photoImg.naturalWidth,
      photoImg.naturalHeight,
      template,
      adjustment
    );
    ctx.drawImage(photoImg, dx, dy, dw, dh);
    ctx.restore();
  };

  if (template.layer_mode === 'behind') {
    // Fill subtle neutral backing inside the cutout in case user zooms out below frame edge
    ctx.save();
    traceFrameClipPath(ctx, template);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.restore();

    drawClippedPhoto();
    ctx.drawImage(templateImg, 0, 0, template.width, template.height);
  } else {
    ctx.drawImage(templateImg, 0, 0, template.width, template.height);
    drawClippedPhoto();
  }

  ctx.restore();
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/png' | 'image/jpeg',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Échec de l’exportation de l’image depuis le Canvas.'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Generates high-resolution individual badges for every session photo in the browser.
 * Yields to the UI thread between badges to keep the interface responsive.
 */
export async function generateBadgesBatch(
  template: TemplateDTO,
  photos: SessionPhoto[],
  onProgress?: (completed: number, total: number) => void
): Promise<GeneratedBadge[]> {
  const templateImg = await loadImageFromUrl(template.file_url);
  const canvas = document.createElement('canvas');
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexte Canvas 2D indisponible pour la génération.');
  }

  const results: GeneratedBadge[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const photoImg = await loadImageFromUrl(photo.objectUrl);

    renderBadgeToCanvas(
      ctx,
      templateImg,
      photoImg,
      template,
      photo.adjustment,
      template.width,
      template.height
    );

    const pngBlob = await canvasToBlob(canvas, 'image/png');
    const previewUrl = URL.createObjectURL(pngBlob);
    const seq = String(i + 1).padStart(3, '0');

    results.push({
      id: `${photo.id}-${Date.now()}-${i}`,
      photoId: photo.id,
      fileNameBase: `badge_${seq}`,
      sourcePhotoName: photo.fileName,
      width: template.width,
      height: template.height,
      pngBlob,
      previewUrl,
      selected: true,
    });

    onProgress?.(i + 1, photos.length);
    // Yield to browser event loop between renders
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}

/**
 * Converts a generated PNG badge Blob into a clean JPEG Blob (flattened on white background).
 */
export async function convertPngBlobToJpeg(
  pngBlob: Blob,
  width: number,
  height: number,
  quality = 0.93
): Promise<Blob> {
  const tempUrl = URL.createObjectURL(pngBlob);
  try {
    const img = await loadImageFromUrl(tempUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexte Canvas 2D indisponible pour la conversion JPEG.');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await canvasToBlob(canvas, 'image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}
