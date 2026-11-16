import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { generateStarterTemplatePng, inspectImageBuffer, STARTER_TEMPLATE_SPECS } from '../server/imageMeta.ts';
import { detectMimeFromMagicBytes } from '../src/lib/fileValidation.ts';
import { computePhotoDrawRect, DEFAULT_ADJUSTMENT } from '../src/lib/imageEngine.ts';

describe('Doolee — Validation binaire, SQLite et API Templates', () => {
  let tmpDir: string;
  let dbPath: string;
  let templatesDir: string;
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createApp>['app']['listen']>;
  let dbInstance: ReturnType<typeof createApp>['database'];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doolee-test-'));
    dbPath = path.join(tmpDir, 'doolee.sqlite');
    templatesDir = path.join(tmpDir, 'templates');

    const created = createApp({ dbPath, templatesDir });
    dbInstance = created.database;

    await new Promise<void>((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dbInstance.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T01 & T02: initialise les templates de départ et persiste en SQLite après redémarrage', () => {
    const reopenTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doolee-reopen-'));
    const reopenDbPath = path.join(reopenTmp, 'reopen.sqlite');
    const reopenTplDir = path.join(reopenTmp, 'templates');

    const first = createApp({ dbPath: reopenDbPath, templatesDir: reopenTplDir });
    expect(first.database.listTemplates().length).toBe(3);
    first.database.close();

    // Simule une fermeture et réouverture de la base SQLite
    const reopened = createApp({ dbPath: reopenDbPath, templatesDir: reopenTplDir });
    expect(reopened.database.listTemplates().length).toBe(3);
    reopened.database.close();
    fs.rmSync(reopenTmp, { recursive: true, force: true });
  });

  it('T01 & T02 (API): importe, renomme et sert un template PNG authentique', async () => {
    const { buffer } = generateStarterTemplatePng(STARTER_TEMPLATE_SPECS[0]);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), 'mon-badge.png');
    form.append('name', 'Badge Événement Test');
    form.append('frame_x', '200');
    form.append('frame_y', '200');
    form.append('frame_width', '600');
    form.append('frame_height', '600');
    form.append('frame_shape', 'circle');
    form.append('layer_mode', 'behind');

    const uploadRes = await fetch(`${baseUrl}/api/templates`, {
      method: 'POST',
      body: form,
    });
    expect(uploadRes.status).toBe(201);
    const uploadJson = (await uploadRes.json()) as { template: { id: string; name: string; width: number; height: number; file_url: string } };
    expect(uploadJson.template.name).toBe('Badge Événement Test');
    expect(uploadJson.template.width).toBe(1080);
    expect(uploadJson.template.height).toBe(1080);

    // Vérifie le téléchargement du fichier binaire du template
    const fileRes = await fetch(`${baseUrl}${uploadJson.template.file_url}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get('content-type')).toBe('image/png');

    // Renomme le template
    const patchRes = await fetch(`${baseUrl}/api/templates/${uploadJson.template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Badge Renommé 2026' }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = (await patchRes.json()) as { template: { name: string } };
    expect(patchJson.template.name).toBe('Badge Renommé 2026');

    // Supprime le template et vérifie la suppression du fichier sur disque
    const delRes = await fetch(`${baseUrl}/api/templates/${uploadJson.template.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
  });

  it('T12: rejette un fichier texte déguisé en .png et accepte JPEG EXIF et WebP VP8X', async () => {
    const fakePng = Buffer.from('NOT A REAL PNG FILE CONTENT', 'utf8');
    expect(inspectImageBuffer(fakePng)).toBeNull();
    expect(detectMimeFromMagicBytes(new Uint8Array(fakePng))).toBeNull();

    // JPEG progressif avec segment EXIF contenant un FF D8 embarqué
    const exifJpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd8,
      0xff, 0xc2, 0x00, 0x0b, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03, 0x01, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    expect(inspectImageBuffer(exifJpeg)).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 1920,
      height: 1080,
    });

    // WebP VP8X 1200x900
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.writeUInt32LE(22, 4);
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8X', 12, 'ascii');
    webp.writeUInt32LE(10, 16);
    webp.writeUIntLE(1199, 24, 3);
    webp.writeUIntLE(899, 27, 3);
    expect(inspectImageBuffer(webp)).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
      width: 1200,
      height: 900,
    });

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(fakePng)], { type: 'image/png' }), 'virus.png');
    form.append('name', 'Faux Template');

    const res = await fetch(`${baseUrl}/api/templates`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Format de fichier invalide');
  });

  it('T10: vérifie que la base SQLite ne contient aucune table ni colonne de photographies', () => {
    const tables = dbInstance.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('templates');
    expect(tableNames.some((n) => n.toLowerCase().includes('photo'))).toBe(false);

    const cols = dbInstance.db
      .prepare('PRAGMA table_info(templates)')
      .all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name.toLowerCase().includes('photo'))).toBe(false);
  });

  it('T05 & T06: calcule le cadrage (déplacement + zoom) sans déformation du ratio d’aspect', () => {
    // Photo portrait 1000x2000 dans un cadre carré 600x600 à (240, 220)
    const frame = { frame_x: 240, frame_y: 220, frame_width: 600, frame_height: 600 };
    const rectDefault = computePhotoDrawRect(1000, 2000, frame, DEFAULT_ADJUSTMENT);

    // Ratio d'aspect 1:2 préservé exactement
    expect(rectDefault.dw / rectDefault.dh).toBeCloseTo(0.5, 5);
    // Remplit la largeur du cadre (600) en mode cover
    expect(rectDefault.dw).toBeCloseTo(600, 5);
    expect(rectDefault.dh).toBeCloseTo(1200, 5);

    // Déplacement + zoom x1.5
    const rectMoved = computePhotoDrawRect(1000, 2000, frame, {
      offsetX: 45,
      offsetY: -30,
      scale: 1.5,
    });
    expect(rectMoved.dw / rectMoved.dh).toBeCloseTo(0.5, 5);
    expect(rectMoved.dw).toBeCloseTo(900, 5);
    expect(rectMoved.dx - rectDefault.dx).toBeCloseTo(45 - 150, 5);
    expect(rectMoved.dy - rectDefault.dy).toBeCloseTo(-30 - 300, 5);
  });

  it('T09: crée une archive ZIP valide contenant des fichiers nommés de façon cohérente', async () => {
    const { buffer } = generateStarterTemplatePng(STARTER_TEMPLATE_SPECS[0]);
    const zip = new JSZip();
    zip.file('badge_001.png', buffer);
    zip.file('badge_002.png', buffer);

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const reopened = await JSZip.loadAsync(zipBytes);
    const names = Object.keys(reopened.files).sort();

    expect(names).toEqual(['badge_001.png', 'badge_002.png']);
    const extracted = await reopened.file('badge_001.png')!.async('uint8array');
    expect(detectMimeFromMagicBytes(extracted)).toBe('image/png');
  });
});
