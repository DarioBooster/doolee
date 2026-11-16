import type { FrameConfig, TemplateDTO } from '../types/doolee.ts';

function isValidTemplate(item: unknown): item is TemplateDTO {
  if (!item || typeof item !== 'object') return false;
  const t = item as Partial<TemplateDTO>;
  return (
    typeof t.id === 'string' &&
    t.id.length > 0 &&
    typeof t.name === 'string' &&
    typeof t.file_url === 'string' &&
    t.file_url.length > 0 &&
    typeof t.width === 'number' &&
    typeof t.height === 'number'
  );
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (data && typeof data.error === 'string' && data.error.trim().length > 0) {
      throw new Error(data.error);
    }
    if (res.status === 413) {
      throw new Error(
        'Le fichier template est trop volumineux pour être transmis au serveur. Réduisez sa taille puis réessayez.'
      );
    }
    throw new Error(`Erreur serveur (${res.status}).`);
  }

  if (!data) {
    throw new Error(`Réponse serveur invalide (statut ${res.status}).`);
  }
  return data as T;
}

export async function fetchTemplates(): Promise<TemplateDTO[]> {
  const res = await fetch('/api/templates');
  const data = await parseJsonResponse<{ templates?: unknown[] }>(res);
  if (!Array.isArray(data.templates)) {
    throw new Error('Format de réponse inattendu lors du chargement des templates.');
  }
  return data.templates.filter(isValidTemplate);
}

export async function uploadTemplate(
  file: File,
  name: string,
  frame: FrameConfig
): Promise<TemplateDTO> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  formData.append('frame_x', String(frame.frame_x));
  formData.append('frame_y', String(frame.frame_y));
  formData.append('frame_width', String(frame.frame_width));
  formData.append('frame_height', String(frame.frame_height));
  formData.append('frame_shape', frame.frame_shape);
  formData.append('layer_mode', frame.layer_mode);

  const res = await fetch('/api/templates', {
    method: 'POST',
    body: formData,
  });
  const data = await parseJsonResponse<{ template?: unknown }>(res);
  if (!isValidTemplate(data.template)) {
    throw new Error('Le serveur n’a pas retourné de template valide après l’enregistrement.');
  }
  return data.template;
}

export async function updateTemplate(
  id: string,
  patch: Partial<{ name: string } & FrameConfig>
): Promise<TemplateDTO> {
  const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJsonResponse<{ template?: unknown }>(res);
  if (!isValidTemplate(data.template)) {
    throw new Error('Le serveur n’a pas retourné de template valide après la mise à jour.');
  }
  return data.template;
}

export async function deleteTemplate(id: string): Promise<string> {
  const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await parseJsonResponse<{ deletedId?: string }>(res);
  return data.deletedId ?? id;
}
