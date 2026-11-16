export const MAX_TEMPLATE_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo
export const MAX_PHOTO_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo
export const MAX_BATCH_PHOTOS = 60;

export type SupportedMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} Mo`;
}

export function formatMimeLabel(mimeType: SupportedMimeType): string {
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/webp') return 'WebP';
  return 'JPEG';
}

/**
 * Inspects the first bytes (magic numbers) of a File or Uint8Array
 * to detect authentic PNG, JPEG, or WebP files regardless of file extension.
 */
export function detectMimeFromMagicBytes(
  bytes: Uint8Array,
  allowWebp = false
): SupportedMimeType | null {
  if (bytes.length < 8) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF....WEBP
  if (
    allowWebp &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export interface ValidatedImageFile {
  file: File;
  mimeType: SupportedMimeType;
  objectUrl: string;
  image: HTMLImageElement;
  width: number;
  height: number;
}

/**
 * Validates a user-selected image file by:
 * 1) Checking file size bounds
 * 2) Verifying binary magic bytes (PNG/JPEG, plus WebP when allowWebp=true)
 * 3) Decoding the image in-browser to reject corrupted or unreadable files
 */
export async function validateAndDecodeImageFile(
  file: File,
  maxBytes: number,
  options?: { allowWebp?: boolean }
): Promise<ValidatedImageFile> {
  if (!file || file.size === 0) {
    throw new Error(`Le fichier « ${file?.name || 'inconnu'} » est vide ou illisible.`);
  }

  if (file.size > maxBytes) {
    throw new Error(
      `Le fichier « ${file.name} » (${formatFileSize(file.size)}) dépasse la limite autorisée de ${formatFileSize(maxBytes)}.`
    );
  }

  const allowWebp = Boolean(options?.allowWebp);
  const headerBuffer = await file.slice(0, 12).arrayBuffer();
  const magicMime = detectMimeFromMagicBytes(new Uint8Array(headerBuffer), allowWebp);

  if (!magicMime) {
    throw new Error(
      allowWebp
        ? `Format incompatible pour « ${file.name} ». Formats acceptés pour les templates : PNG, JPG, JPEG et WebP.`
        : `Format incompatible pour « ${file.name} ». Seuls les fichiers PNG, JPG et JPEG authentiques sont acceptés.`
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(objectUrl);
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error(`Impossible de lire les dimensions de « ${file.name} ».`);
    }
    return {
      file,
      mimeType: magicMime,
      objectUrl,
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    if (err instanceof Error && err.message.includes('«')) {
      throw err;
    }
    throw new Error(`Le fichier « ${file.name} » est corrompu ou illisible par le navigateur.`);
  }
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Échec du chargement de l’image.'));
    img.src = url;
  });
}
