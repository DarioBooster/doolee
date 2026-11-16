import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crop,
  ImagePlus,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  formatFileSize,
  formatMimeLabel,
  loadImageFromUrl,
  MAX_BATCH_PHOTOS,
} from '../lib/fileValidation.ts';
import { DEFAULT_ADJUSTMENT, renderBadgeToCanvas } from '../lib/imageEngine.ts';
import type { PhotoAdjustment, SessionPhoto, TemplateDTO } from '../types/doolee.ts';

interface StudioViewProps {
  templates: TemplateDTO[];
  activeTemplate: TemplateDTO | null;
  photos: SessionPhoto[];
  selectedPhotoId: string | null;
  importErrors: string[];
  isImportingPhotos: boolean;
  isGenerating: boolean;
  generationProgress: { completed: number; total: number } | null;
  onSelectTemplateForSession: (template: TemplateDTO) => void;
  onResetSessionTemplate: () => void;
  onOpenImportTemplate: () => void;
  onEditActiveTemplateFrame: (template: TemplateDTO) => void;
  onImportPhotos: (files: FileList | File[]) => Promise<void>;
  onDismissImportErrors: () => void;
  onSelectPhoto: (photoId: string) => void;
  onRemovePhoto: (photoId: string) => void;
  onUpdateAdjustment: (photoId: string, adjustment: PhotoAdjustment) => void;
  onResetAdjustment: (photoId: string) => void;
  onGenerateBadges: () => Promise<void>;
}

export function StudioView({
  templates,
  activeTemplate,
  photos,
  selectedPhotoId,
  importErrors,
  isImportingPhotos,
  isGenerating,
  generationProgress,
  onSelectTemplateForSession,
  onResetSessionTemplate,
  onOpenImportTemplate,
  onEditActiveTemplateFrame,
  onImportPhotos,
  onDismissImportErrors,
  onSelectPhoto,
  onRemovePhoto,
  onUpdateAdjustment,
  onResetAdjustment,
  onGenerateBadges,
}: StudioViewProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templateImgRef = useRef<HTMLImageElement | null>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);

  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [confirmSwitchTemplate, setConfirmSwitchTemplate] = useState(false);
  const [canvasReadyTick, setCanvasReadyTick] = useState(0);

  // Pointer drag state on interactive preview canvas
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    origOffsetX: 0,
    origOffsetY: 0,
  });

  const selectedPhoto = photos.find((p) => p.id === selectedPhotoId) ?? photos[0] ?? null;

  // Load active template image once when activeTemplate changes
  useEffect(() => {
    let cancelled = false;
    templateImgRef.current = null;
    if (!activeTemplate) return;

    loadImageFromUrl(activeTemplate.file_url)
      .then((img) => {
        if (!cancelled) {
          templateImgRef.current = img;
          setCanvasReadyTick((t) => t + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          templateImgRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTemplate]);

  // Load selected photo image when selection changes
  useEffect(() => {
    let cancelled = false;
    photoImgRef.current = null;
    if (!selectedPhoto) return;

    loadImageFromUrl(selectedPhoto.objectUrl)
      .then((img) => {
        if (!cancelled) {
          photoImgRef.current = img;
          setCanvasReadyTick((t) => t + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          photoImgRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPhoto?.id, selectedPhoto?.objectUrl]);

  // Re-render real-time preview canvas whenever template, photo, or adjustments change
  useEffect(() => {
    const canvas = canvasRef.current;
    const tplImg = templateImgRef.current;
    if (!canvas || !activeTemplate || !tplImg) return;

    const maxDisplay = 560;
    const ratio = Math.min(1, maxDisplay / Math.max(activeTemplate.width, activeTemplate.height));
    const displayW = Math.max(1, Math.round(activeTemplate.width * ratio));
    const displayH = Math.max(1, Math.round(activeTemplate.height * ratio));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderBadgeToCanvas(
      ctx,
      tplImg,
      photoImgRef.current,
      activeTemplate,
      selectedPhoto?.adjustment ?? DEFAULT_ADJUSTMENT,
      canvas.width,
      canvas.height
    );
  }, [activeTemplate, selectedPhoto, canvasReadyTick]);

  const selectedPhotoRef = useRef<SessionPhoto | null>(selectedPhoto);
  selectedPhotoRef.current = selectedPhoto;
  const onUpdateAdjustmentRef = useRef(onUpdateAdjustment);
  onUpdateAdjustmentRef.current = onUpdateAdjustment;

  // Attach non-passive wheel listener so preventDefault works without browser console errors
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const current = selectedPhotoRef.current;
      if (!current) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      const nextScale = Math.max(
        0.4,
        Math.min(3.5, Number((current.adjustment.scale + delta).toFixed(2)))
      );
      onUpdateAdjustmentRef.current(current.id, {
        ...current.adjustment,
        scale: nextScale,
      });
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel);
    };
  }, [activeTemplate?.id, selectedPhoto?.id]);

  // Step 1 Gate: Mandatory template selection BEFORE importing photos (Section 12)
  if (!activeTemplate) {
    const validTemplates = templates.filter(
      (tpl): tpl is TemplateDTO => Boolean(tpl && tpl.id && tpl.file_url)
    );

    return (
      <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="border-b border-slate-200 pb-6">
          <p className="text-sm font-semibold text-teal-800">Étape 1 sur 3 · Choix du modèle</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
            Sélectionnez un template pour démarrer une session
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
            Un seul template peut être utilisé par session de génération. Choisissez un modèle
            enregistré ci-dessous ou importez-en un nouveau avant d’ajouter vos photographies.
          </p>
        </div>

        {validTemplates.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-12 text-center">
            <Layers className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
            <h2 className="mt-3 text-base font-bold text-slate-900">
              Aucun template disponible
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Importez un fichier graphique PNG ou JPEG pour démarrer votre première session.
            </p>
            <button
              type="button"
              onClick={onOpenImportTemplate}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Importer un template</span>
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {validTemplates.map((tpl) => (
              <article
                key={tpl.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-teal-700"
              >
                <div className="checkerboard-bg flex aspect-[4/3] w-full items-center justify-center border-b border-slate-200 p-4">
                  <img
                    src={tpl.file_url}
                    alt={tpl.name}
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <h2 className="truncate text-base font-bold text-slate-900">{tpl.name}</h2>
                    <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                      {tpl.width} × {tpl.height} px · {formatMimeLabel(tpl.mime_type)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectTemplateForSession(tpl)}
                    className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
                  >
                    Utiliser ce template
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selectedPhoto || !canvasRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or already-released pointer captures
    }
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: selectedPhoto.adjustment.offsetX,
      origOffsetY: selectedPhoto.adjustment.offsetY,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current.active || !selectedPhoto || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaleX = activeTemplate.width / rect.width;
    const scaleY = activeTemplate.height / rect.height;
    const dx = (e.clientX - dragStateRef.current.startX) * scaleX;
    const dy = (e.clientY - dragStateRef.current.startY) * scaleY;

    onUpdateAdjustment(selectedPhoto.id, {
      ...selectedPhoto.adjustment,
      offsetX: Math.round(dragStateRef.current.origOffsetX + dx),
      offsetY: Math.round(dragStateRef.current.origOffsetY + dy),
    });
  };

  const handleCanvasPointerUp = () => {
    dragStateRef.current.active = false;
  };

  const nudgeOffset = (dx: number, dy: number) => {
    if (!selectedPhoto) return;
    onUpdateAdjustment(selectedPhoto.id, {
      ...selectedPhoto.adjustment,
      offsetX: selectedPhoto.adjustment.offsetX + dx,
      offsetY: selectedPhoto.adjustment.offsetY + dy,
    });
  };

  const adjustScale = (delta: number) => {
    if (!selectedPhoto) return;
    const nextScale = Math.max(
      0.4,
      Math.min(3.5, Number((selectedPhoto.adjustment.scale + delta).toFixed(2)))
    );
    onUpdateAdjustment(selectedPhoto.id, {
      ...selectedPhoto.adjustment,
      scale: nextScale,
    });
  };

  const maxOffsetRange = Math.round(Math.max(activeTemplate.width, activeTemplate.height) * 0.75);
  const nudgeStep = Math.max(8, Math.round(activeTemplate.width * 0.015));

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Active Single-Template Session Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="checkerboard-bg h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200">
            <img
              src={activeTemplate.file_url}
              alt={activeTemplate.name}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-teal-800">Template actif de la session</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeTemplate.width} × {activeTemplate.height} px
              </span>
            </div>
            <h1 className="truncate text-base font-bold text-slate-900">{activeTemplate.name}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            <span>Photos traitées localement</span>
          </span>

          <button
            type="button"
            onClick={() => onEditActiveTemplateFrame(activeTemplate)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Crop className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Zone photo</span>
          </button>

          {confirmSwitchTemplate ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs">
              <span className="font-medium text-amber-950">
                Changer de template réinitialisera les {photos.length} photo(s) en cours :
              </span>
              <button
                type="button"
                onClick={() => {
                  setConfirmSwitchTemplate(false);
                  onResetSessionTemplate();
                }}
                className="rounded bg-amber-700 px-2.5 py-1 font-semibold text-white hover:bg-amber-800"
              >
                Nouvelle session
              </button>
              <button
                type="button"
                onClick={() => setConfirmSwitchTemplate(false)}
                className="rounded border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (photos.length > 0) {
                  setConfirmSwitchTemplate(true);
                } else {
                  onResetSessionTemplate();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Changer de template</span>
            </button>
          )}
        </div>
      </div>

      {/* Explicit Import Error Messages */}
      {importErrors.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="font-semibold">Certains fichiers n’ont pas pu être importés :</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  {importErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissImportErrors}
              className="text-xs font-semibold text-red-800 hover:underline shrink-0"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Photo Drag & Drop Import Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragLeave={() => setIsDraggingFiles(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFiles(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onImportPhotos(e.dataTransfer.files);
          }
        }}
        className={`mt-5 rounded-xl border-2 border-dashed transition-colors ${
          isDraggingFiles
            ? 'border-teal-700 bg-teal-50/70'
            : 'border-slate-300 bg-white hover:border-slate-400'
        } ${photos.length === 0 ? 'p-10' : 'px-5 py-4'}`}
      >
        <input
          ref={photoInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onImportPhotos(e.target.files);
              e.target.value = '';
            }
          }}
          className="sr-only"
        />

        {photos.length === 0 ? (
          <div className="flex flex-col items-center text-center">
            <Upload className="h-9 w-9 text-teal-700" aria-hidden="true" />
            <h2 className="mt-3 text-base font-bold text-slate-900">
              Importez vos photographies (sélection multiple)
            </h2>
            <p className="mt-1 max-w-lg text-sm text-slate-600">
              Glissez-déposez un ou plusieurs portraits JPG, JPEG ou PNG ici, ou sélectionnez-les
              depuis votre ordinateur (max {MAX_BATCH_PHOTOS} photos par session).
            </p>
            <button
              type="button"
              disabled={isImportingPhotos}
              onClick={() => photoInputRef.current?.click()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              <span>
                {isImportingPhotos ? 'Analyse en cours...' : 'Sélectionner des photographies'}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {photos.length}
              </span>{' '}
              {photos.length > 1 ? 'photographies chargées' : 'photographie chargée'} en mémoire
              locale · Glissez d’autres fichiers ici pour les ajouter à la session.
            </div>
            <button
              type="button"
              disabled={isImportingPhotos}
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isImportingPhotos ? 'Chargement...' : 'Ajouter des photos'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Editor Stage + Thumbnails Gallery */}
      {photos.length > 0 && selectedPhoto && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Left Column: Imported Photos Thumbnails List */}
          <aside className="flex flex-col rounded-xl border border-slate-200 bg-white lg:col-span-4">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">
                Photographies ({photos.length})
              </h2>
              <span className="text-xs text-slate-500">Cliquez pour ajuster</span>
            </div>

            <ul className="max-h-[460px] divide-y divide-slate-100 overflow-y-auto">
              {photos.map((photo, index) => {
                const isSelected = photo.id === selectedPhoto.id;
                const isModified =
                  photo.adjustment.offsetX !== 0 ||
                  photo.adjustment.offsetY !== 0 ||
                  photo.adjustment.scale !== 1;

                return (
                  <li
                    key={photo.id}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPhoto(photo.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.fileName}
                        className={`h-14 w-14 shrink-0 rounded-lg border object-cover ${
                          isSelected ? 'border-teal-700' : 'border-slate-200'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {index + 1}. {photo.fileName}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                          {photo.naturalWidth} × {photo.naturalHeight} px ·{' '}
                          {formatFileSize(photo.fileSize)}
                        </p>
                        {isModified && (
                          <p className="mt-0.5 text-[11px] font-medium text-teal-800">
                            Cadrage personnalisé
                          </p>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemovePhoto(photo.id)}
                      aria-label={`Retirer ${photo.fileName}`}
                      title="Retirer cette photographie"
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Center/Right Column: Interactive Real-Time Preview & Adjustment Controls */}
          <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
            <div className="grid gap-6 md:grid-cols-12">
              {/* Interactive Canvas */}
              <div className="flex flex-col items-center md:col-span-7">
                <div className="mb-2 flex w-full items-center justify-between text-xs text-slate-500">
                  <span>Aperçu en temps réel (glisser pour déplacer)</span>
                  <span className="font-mono tabular-nums">
                    Zoom {Math.round(selectedPhoto.adjustment.scale * 100)} %
                  </span>
                </div>

                <div className="checkerboard-bg flex w-full items-center justify-center rounded-xl border border-slate-200 p-3">
                  <canvas
                    ref={canvasRef}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerCancel={handleCanvasPointerUp}
                    aria-label={`Aperçu interactif du badge pour ${selectedPhoto.fileName}`}
                    className="max-h-[440px] max-w-full cursor-grab touch-none rounded shadow-xs active:cursor-grabbing"
                    style={{
                      aspectRatio: `${activeTemplate.width} / ${activeTemplate.height}`,
                    }}
                  />
                </div>
              </div>

              {/* Controls Panel */}
              <div className="flex flex-col justify-between gap-5 md:col-span-5">
                <div className="space-y-5">
                  <div>
                    <h2 className="truncate text-sm font-bold text-slate-900">
                      Réglages : {selectedPhoto.fileName}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Les ajustements sont conservés automatiquement entre chaque photo.
                    </p>
                  </div>

                  {/* Zoom Slider */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="zoom-range"
                        className="text-xs font-semibold text-slate-700"
                      >
                        Agrandir / Réduire
                      </label>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        {Math.round(selectedPhoto.adjustment.scale * 100)} %
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustScale(-0.1)}
                        aria-label="Réduire la photo"
                        className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      >
                        <ZoomOut className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <input
                        id="zoom-range"
                        type="range"
                        min={0.4}
                        max={3.5}
                        step={0.02}
                        value={selectedPhoto.adjustment.scale}
                        onChange={(e) =>
                          onUpdateAdjustment(selectedPhoto.id, {
                            ...selectedPhoto.adjustment,
                            scale: Number(e.target.value),
                          })
                        }
                        className="flex-1 accent-teal-700"
                      />
                      <button
                        type="button"
                        onClick={() => adjustScale(0.1)}
                        aria-label="Agrandir la photo"
                        className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      >
                        <ZoomIn className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Horizontal & Vertical Sliders */}
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <label htmlFor="offset-x-range" className="font-semibold text-slate-700">
                          Position horizontale (X)
                        </label>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {selectedPhoto.adjustment.offsetX} px
                        </span>
                      </div>
                      <input
                        id="offset-x-range"
                        type="range"
                        min={-maxOffsetRange}
                        max={maxOffsetRange}
                        step={2}
                        value={selectedPhoto.adjustment.offsetX}
                        onChange={(e) =>
                          onUpdateAdjustment(selectedPhoto.id, {
                            ...selectedPhoto.adjustment,
                            offsetX: Number(e.target.value),
                          })
                        }
                        className="w-full accent-teal-700"
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <label htmlFor="offset-y-range" className="font-semibold text-slate-700">
                          Position verticale (Y)
                        </label>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {selectedPhoto.adjustment.offsetY} px
                        </span>
                      </div>
                      <input
                        id="offset-y-range"
                        type="range"
                        min={-maxOffsetRange}
                        max={maxOffsetRange}
                        step={2}
                        value={selectedPhoto.adjustment.offsetY}
                        onChange={(e) =>
                          onUpdateAdjustment(selectedPhoto.id, {
                            ...selectedPhoto.adjustment,
                            offsetY: Number(e.target.value),
                          })
                        }
                        className="w-full accent-teal-700"
                      />
                    </div>
                  </div>

                  {/* Precision Directional Pad + Reset */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => nudgeOffset(-nudgeStep, 0)}
                        aria-label="Déplacer à gauche"
                        className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeOffset(0, -nudgeStep)}
                        aria-label="Déplacer vers le haut"
                        className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeOffset(0, nudgeStep)}
                        aria-label="Déplacer vers le bas"
                        className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeOffset(nudgeStep, 0)}
                        aria-label="Déplacer à droite"
                        className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onResetAdjustment(selectedPhoto.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Réinitialiser</span>
                    </button>
                  </div>
                </div>

                {/* Generate Batch CTA */}
                <div className="border-t border-slate-200 pt-4">
                  {isGenerating && generationProgress ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Génération haute résolution...</span>
                        <span className="font-mono tabular-nums">
                          {generationProgress.completed} / {generationProgress.total}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-teal-700 transition-transform duration-150"
                          style={{
                            width: `${Math.round(
                              (generationProgress.completed / Math.max(1, generationProgress.total)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isGenerating || photos.length === 0}
                      onClick={onGenerateBadges}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      <span>
                        Générer {photos.length > 1 ? `les ${photos.length} badges` : 'le badge'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
