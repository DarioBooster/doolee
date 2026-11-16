import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateStarterTemplatePng, STARTER_TEMPLATE_SPECS } from './imageMeta.ts';
import type { FrameShape, LayerMode, TemplatePublicDTO, TemplateRecord } from './types.ts';

export interface CreateTemplateInput {
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
  is_sample?: number;
}

export interface UpdateTemplateInput {
  name?: string;
  frame_x?: number;
  frame_y?: number;
  frame_width?: number;
  frame_height?: number;
  frame_shape?: FrameShape;
  layer_mode?: LayerMode;
}

export class DooleeDatabase {
  public readonly db: DatabaseSync;
  public readonly templatesDir: string;

  constructor(dbPath: string, templatesDir: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });
    this.templatesDir = templatesDir;
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
    this.seedStarterTemplatesOnce();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filename TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
        file_size INTEGER NOT NULL CHECK (file_size > 0),
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        frame_x INTEGER NOT NULL CHECK (frame_x >= 0),
        frame_y INTEGER NOT NULL CHECK (frame_y >= 0),
        frame_width INTEGER NOT NULL CHECK (frame_width > 0),
        frame_height INTEGER NOT NULL CHECK (frame_height > 0),
        frame_shape TEXT NOT NULL DEFAULT 'rect' CHECK (frame_shape IN ('rect', 'rounded', 'circle')),
        layer_mode TEXT NOT NULL DEFAULT 'behind' CHECK (layer_mode IN ('behind', 'front')),
        is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates (updated_at DESC);
    `);

    // Migrate existing SQLite table if created prior to image/webp support
    const tableSqlRow = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'templates'")
      .get() as { sql?: string } | undefined;
    if (tableSqlRow?.sql && !tableSqlRow.sql.includes('image/webp')) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE templates_migrated (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          filename TEXT NOT NULL UNIQUE,
          mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
          file_size INTEGER NOT NULL CHECK (file_size > 0),
          width INTEGER NOT NULL CHECK (width > 0),
          height INTEGER NOT NULL CHECK (height > 0),
          frame_x INTEGER NOT NULL CHECK (frame_x >= 0),
          frame_y INTEGER NOT NULL CHECK (frame_y >= 0),
          frame_width INTEGER NOT NULL CHECK (frame_width > 0),
          frame_height INTEGER NOT NULL CHECK (frame_height > 0),
          frame_shape TEXT NOT NULL DEFAULT 'rect' CHECK (frame_shape IN ('rect', 'rounded', 'circle')),
          layer_mode TEXT NOT NULL DEFAULT 'behind' CHECK (layer_mode IN ('behind', 'front')),
          is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO templates_migrated SELECT * FROM templates;
        DROP TABLE templates;
        ALTER TABLE templates_migrated RENAME TO templates;
        CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates (updated_at DESC);
        COMMIT;
      `);
    }
  }

  private seedStarterTemplatesOnce(): void {
    const row = this.db
      .prepare("SELECT value FROM app_meta WHERE key = 'starter_templates_seeded'")
      .get();
    if (row) {
      return;
    }

    const now = new Date().toISOString();
    for (const spec of STARTER_TEMPLATE_SPECS) {
      const filename = `${spec.id}.png`;
      const targetPath = path.join(this.templatesDir, filename);
      const { buffer, width, height } = generateStarterTemplatePng(spec);
      fs.writeFileSync(targetPath, buffer);

      this.insertTemplate({
        id: spec.id,
        name: spec.name,
        filename,
        mime_type: 'image/png',
        file_size: buffer.length,
        width,
        height,
        frame_x: spec.frameX,
        frame_y: spec.frameY,
        frame_width: spec.frameWidth,
        frame_height: spec.frameHeight,
        frame_shape: spec.frameShape,
        layer_mode: 'behind',
        is_sample: 1,
      }, now);
    }

    this.db
      .prepare("INSERT INTO app_meta (key, value) VALUES ('starter_templates_seeded', ?)")
      .run(now);
  }

  public toPublicDTO(record: TemplateRecord): TemplatePublicDTO {
    return {
      ...record,
      file_url: `/api/templates/${encodeURIComponent(record.id)}/file`,
    };
  }

  public listTemplates(): TemplatePublicDTO[] {
    const rows = this.db
      .prepare('SELECT * FROM templates ORDER BY updated_at DESC, created_at DESC')
      .all() as unknown as TemplateRecord[];
    return rows.map((row) => this.toPublicDTO(row));
  }

  public getTemplateById(id: string): TemplateRecord | null {
    const row = this.db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(id) as unknown as TemplateRecord | undefined;
    return row ?? null;
  }

  public insertTemplate(input: CreateTemplateInput, timestamp?: string): TemplatePublicDTO {
    const now = timestamp ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO templates (
          id, name, filename, mime_type, file_size, width, height,
          frame_x, frame_y, frame_width, frame_height, frame_shape, layer_mode,
          is_sample, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.name,
        input.filename,
        input.mime_type,
        input.file_size,
        input.width,
        input.height,
        input.frame_x,
        input.frame_y,
        input.frame_width,
        input.frame_height,
        input.frame_shape,
        input.layer_mode,
        input.is_sample ?? 0,
        now,
        now
      );

    const created = this.getTemplateById(input.id);
    if (!created) {
      throw new Error('Failed to retrieve inserted template');
    }
    return this.toPublicDTO(created);
  }

  public updateTemplate(id: string, patch: UpdateTemplateInput): TemplatePublicDTO | null {
    const existing = this.getTemplateById(id);
    if (!existing) {
      return null;
    }

    const updatedName = patch.name !== undefined ? patch.name : existing.name;
    const frameX = patch.frame_x !== undefined ? patch.frame_x : existing.frame_x;
    const frameY = patch.frame_y !== undefined ? patch.frame_y : existing.frame_y;
    const frameWidth = patch.frame_width !== undefined ? patch.frame_width : existing.frame_width;
    const frameHeight = patch.frame_height !== undefined ? patch.frame_height : existing.frame_height;
    const frameShape = patch.frame_shape !== undefined ? patch.frame_shape : existing.frame_shape;
    const layerMode = patch.layer_mode !== undefined ? patch.layer_mode : existing.layer_mode;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE templates
         SET name = ?, frame_x = ?, frame_y = ?, frame_width = ?, frame_height = ?,
             frame_shape = ?, layer_mode = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        updatedName,
        frameX,
        frameY,
        frameWidth,
        frameHeight,
        frameShape,
        layerMode,
        now,
        id
      );

    const updated = this.getTemplateById(id);
    return updated ? this.toPublicDTO(updated) : null;
  }

  public deleteTemplate(id: string): TemplateRecord | null {
    const existing = this.getTemplateById(id);
    if (!existing) {
      return null;
    }

    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return existing;
  }

  public close(): void {
    this.db.close();
  }
}
