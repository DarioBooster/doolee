import JSZip from 'jszip';
import type { GeneratedBadge } from '../types/doolee.ts';
import { convertPngBlobToJpeg } from './imageEngine.ts';

export type ExportFormat = 'png' | 'jpeg';

/**
 * Packages selected generated badges into a standard ZIP archive entirely in the browser.
 */
export async function createBadgesZip(
  badges: GeneratedBadge[],
  format: ExportFormat,
  onProgress?: (completed: number, total: number) => void
): Promise<Blob> {
  if (badges.length === 0) {
    throw new Error('Aucun badge sélectionné pour l’exportation ZIP.');
  }

  const zip = new JSZip();
  const ext = format === 'jpeg' ? 'jpg' : 'png';

  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    const filename = `${badge.fileNameBase}.${ext}`;
    const blob =
      format === 'jpeg'
        ? await convertPngBlobToJpeg(badge.pngBlob, badge.width, badge.height)
        : badge.pngBlob;

    zip.file(filename, blob);
    onProgress?.(i + 1, badges.length);
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

export function slugifyFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'doolee'
  );
}
