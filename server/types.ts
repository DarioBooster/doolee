export type FrameShape = 'rect' | 'rounded' | 'circle';
export type LayerMode = 'behind' | 'front';

export interface TemplateRecord {
  id: string;
  name: string;
  filename: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  file_size: number;
  width: number;
  height: number;
  frame_x: number;
  frame_y: number;
  frame_width: number;
  frame_height: number;
  frame_shape: FrameShape;
  layer_mode: LayerMode;
  is_sample: number;
  created_at: string;
  updated_at: string;
}

export interface TemplatePublicDTO extends TemplateRecord {
  file_url: string;
}
