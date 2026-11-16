import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { DooleeDatabase } from './db.ts';
import { inspectImageBuffer } from './imageMeta.ts';
import type { FrameShape, LayerMode } from './types.ts';

const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024; // 20 Mo
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const ALLOWED_SHAPES: ReadonlySet<FrameShape> = new Set(['rect', 'rounded', 'circle']);
const ALLOWED_MODES: ReadonlySet<LayerMode> = new Set(['behind', 'front']);

export interface AppOptions {
  dbPath?: string;
  templatesDir?: string;
}

function resolveSafeTemplatePath(templatesDir: string, filename: string): string | null {
  if (!filename || !SAFE_FILENAME_REGEX.test(filename)) {
    return null;
  }
  const baseName = path.basename(filename);
  if (baseName !== filename) {
    return null;
  }
  const resolvedRoot = path.resolve(templatesDir);
  const resolvedTarget = path.resolve(resolvedRoot, baseName);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

function clampFrame(
  rawX: unknown,
  rawY: unknown,
  rawW: unknown,
  rawH: unknown,
  imgWidth: number,
  imgHeight: number
) {
  const defaultW = Math.max(1, Math.round(imgWidth * 0.6));
  const defaultH = Math.max(1, Math.round(imgHeight * 0.6));
  const defaultX = Math.max(0, Math.round((imgWidth - defaultW) / 2));
  const defaultY = Math.max(0, Math.round((imgHeight - defaultH) / 2));

  const parsedX = Number(rawX);
  const parsedY = Number(rawY);
  const parsedW = Number(rawW);
  const parsedH = Number(rawH);

  const hasValidCoords =
    Number.isFinite(parsedX) &&
    Number.isFinite(parsedY) &&
    Number.isFinite(parsedW) &&
    Number.isFinite(parsedH) &&
    parsedW > 0 &&
    parsedH > 0;

  if (!hasValidCoords) {
    return {
      frame_x: defaultX,
      frame_y: defaultY,
      frame_width: defaultW,
      frame_height: defaultH,
    };
  }

  const x = Math.max(0, Math.min(imgWidth - 1, Math.round(parsedX)));
  const y = Math.max(0, Math.min(imgHeight - 1, Math.round(parsedY)));
  const w = Math.max(1, Math.min(imgWidth - x, Math.round(parsedW)));
  const h = Math.max(1, Math.min(imgHeight - y, Math.round(parsedH)));

  return {
    frame_x: x,
    frame_y: y,
    frame_width: w,
    frame_height: h,
  };
}

function sanitizeTemplateName(raw: unknown, fallback = 'Template sans nom'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function createApp(options: AppOptions = {}) {
  const dataRoot = path.resolve(process.cwd(), 'data');
  const dbPath = options.dbPath ?? path.join(dataRoot, 'doolee.sqlite');
  const templatesDir = options.templatesDir ?? path.join(dataRoot, 'templates');

  const database = new DooleeDatabase(dbPath, templatesDir);
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Memory upload storage so we inspect real magic bytes before writing to disk
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_TEMPLATE_BYTES,
      files: 1,
    },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'doolee-templates' });
  });

  app.get('/api/templates', (_req, res) => {
    const templates = database.listTemplates();
    res.json({ templates });
  });

  app.get('/api/templates/:id/file', (req, res) => {
    const template = database.getTemplateById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template introuvable.' });
      return;
    }

    const filePath = resolveSafeTemplatePath(templatesDir, template.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Fichier du template introuvable sur le disque.' });
      return;
    }

    res.setHeader('Content-Type', template.mime_type);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  });

  app.post('/api/templates', upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: 'Aucun fichier template fourni.' });
      return;
    }

    const inspected = inspectImageBuffer(file.buffer);
    if (!inspected) {
      res.status(400).json({
        error:
          'Format de fichier invalide ou corrompu. Seules les images PNG, JPEG et WebP authentiques sont acceptées.',
      });
      return;
    }

    const id = crypto.randomUUID();
    const filename = `${id}.${inspected.extension}`;
    const targetPath = resolveSafeTemplatePath(templatesDir, filename);
    if (!targetPath) {
      res.status(500).json({ error: 'Chemin de stockage invalide.' });
      return;
    }

    const baseFileName = path.parse(file.originalname || 'template').name;
    const name = sanitizeTemplateName(req.body?.name, sanitizeTemplateName(baseFileName, 'Nouveau template'));

    const frame = clampFrame(
      req.body?.frame_x,
      req.body?.frame_y,
      req.body?.frame_width,
      req.body?.frame_height,
      inspected.width,
      inspected.height
    );

    const rawShape = String(req.body?.frame_shape ?? 'rect') as FrameShape;
    const frame_shape: FrameShape = ALLOWED_SHAPES.has(rawShape) ? rawShape : 'rect';

    const rawMode = String(
      req.body?.layer_mode ?? (inspected.mimeType === 'image/png' ? 'behind' : 'front')
    ) as LayerMode;
    const layer_mode: LayerMode = ALLOWED_MODES.has(rawMode) ? rawMode : 'front';

    fs.writeFileSync(targetPath, file.buffer);

    const created = database.insertTemplate({
      id,
      name,
      filename,
      mime_type: inspected.mimeType,
      file_size: file.buffer.length,
      width: inspected.width,
      height: inspected.height,
      frame_x: frame.frame_x,
      frame_y: frame.frame_y,
      frame_width: frame.frame_width,
      frame_height: frame.frame_height,
      frame_shape,
      layer_mode,
      is_sample: 0,
    });

    res.status(201).json({ template: created });
  });

  app.patch('/api/templates/:id', (req, res) => {
    const existing = database.getTemplateById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Template introuvable.' });
      return;
    }

    const body = req.body ?? {};
    const patch: {
      name?: string;
      frame_x?: number;
      frame_y?: number;
      frame_width?: number;
      frame_height?: number;
      frame_shape?: FrameShape;
      layer_mode?: LayerMode;
    } = {};

    if (body.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (!trimmed) {
        res.status(400).json({ error: 'Le nom du template ne peut pas être vide.' });
        return;
      }
      patch.name = sanitizeTemplateName(trimmed);
    }

    if (
      body.frame_x !== undefined ||
      body.frame_y !== undefined ||
      body.frame_width !== undefined ||
      body.frame_height !== undefined
    ) {
      const clamped = clampFrame(
        body.frame_x ?? existing.frame_x,
        body.frame_y ?? existing.frame_y,
        body.frame_width ?? existing.frame_width,
        body.frame_height ?? existing.frame_height,
        existing.width,
        existing.height
      );
      patch.frame_x = clamped.frame_x;
      patch.frame_y = clamped.frame_y;
      patch.frame_width = clamped.frame_width;
      patch.frame_height = clamped.frame_height;
    }

    if (body.frame_shape !== undefined) {
      if (!ALLOWED_SHAPES.has(body.frame_shape)) {
        res.status(400).json({ error: 'Forme de cadre invalide.' });
        return;
      }
      patch.frame_shape = body.frame_shape;
    }

    if (body.layer_mode !== undefined) {
      if (!ALLOWED_MODES.has(body.layer_mode)) {
        res.status(400).json({ error: 'Mode de superposition invalide.' });
        return;
      }
      patch.layer_mode = body.layer_mode;
    }

    const updated = database.updateTemplate(req.params.id, patch);
    res.json({ template: updated });
  });

  app.delete('/api/templates/:id', (req, res) => {
    const deleted = database.deleteTemplate(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Template introuvable.' });
      return;
    }

    const filePath = resolveSafeTemplatePath(templatesDir, deleted.filename);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ deletedId: deleted.id });
  });

  // Explicit error handler for multer & JSON parsing errors
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Doolee API Error]', err);
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'Le fichier template dépasse la taille maximale autorisée de 20 Mo.',
        });
        return;
      }
      res.status(400).json({ error: `Erreur lors de la réception du fichier : ${err.message}` });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Corps de requête JSON invalide.' });
      return;
    }
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return { app, database, templatesDir };
}
