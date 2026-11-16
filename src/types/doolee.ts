export type FrameShape = 'rect' | 'rounded' | 'circle';
export type LayerMode = 'behind' | 'front';

export interface FrameConfig {
  frame_x: number;
  frame_y: number;
  frame_width: number;
  frame_height: number;
  frame_shape: FrameShape;
  layer_mode: LayerMode;
}

export interface TemplateDTO extends FrameConfig {
  id: string;
  name: string;
  filename: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  file_size: number;
  width: number;
  height: number;
  is_sample: number;
  created_at: string;
  updated_at: string;
  file_url: string;
}

export interface PhotoAdjustment {
  offsetX: number; // px offset in native template space relative to frame center
  offsetY: number;
  scale: number; // 1.0 = exact cover fit inside frame
}

export interface SessionPhoto {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: 'image/png' | 'image/jpeg';
  objectUrl: string;
  thumbnailUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  adjustment: PhotoAdjustment;
}

export interface GeneratedBadge {
  id: string;
  photoId: string;
  fileNameBase: string;
  sourcePhotoName: string;
  width: number;
  height: number;
  pngBlob: Blob;
  previewUrl: string;
  selected: boolean;
}

export type AppView = 'home' | 'templates' | 'studio' | 'results';

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
