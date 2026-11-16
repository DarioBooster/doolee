import { AlertTriangle, Crosshair, Eye, Move, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  formatFileSize,
  MAX_TEMPLATE_SIZE_BYTES,
  validateAndDecodeImageFile,
} from '../lib/fileValidation.ts';
import {
  DEFAULT_ADJUSTMENT,
  detectTemplateFrame,
  renderBadgeToCanvas,
} from '../lib/imageEngine.ts';
import type { FrameConfig, FrameShape, LayerMode, TemplateDTO } from '../types/doolee.ts';

interface TemplateModalProps {
  isOpen: boolean;
  editingTemplate: TemplateDTO | null;
  onClose: () => void;
  onSaveNew: (file: File, name: string, frame: FrameConfig) => Promise<void>;
  onSaveFrameEdit: (templateId: string, name: string, frame: FrameConfig) => Promise<void>;
}

type DragHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const MIN_FRAME_PX = 24;

// Built-in clean portrait SVG used solely for visual zone preview inside the modal
const SAMPLE_PORTRAIT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#cbd5e1"/>
        <stop offset="100%" stop-color="#94a3b8"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bg)"/>
    <circle cx="200" cy="148" r="64" fill="#334155"/>
    <path d="M84 368 C84 268, 316 268, 316 368 Z" fill="#1e293b"/>
    <circle cx="200" cy="148" r="56" fill="#475569" opacity="0.35"/>
  </svg>`
)}`;

export function TemplateModal({
  isOpen,
  editingTemplate,
  onClose,
  onSaveNew,
  onSaveFrameEdit,
}: TemplateModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const templateImgRef = useRef<HTMLImageElement | null>(null);
  const sampleImgRef = useRef<HTMLImageElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [name, setName] = useState('');
  const [frame, setFrame] = useState<FrameConfig>({
    frame_x: 0,
    frame_y: 0,
    frame_width: 400,
    frame_height: 400,
    frame_shape: 'rect',
    layer_mode: 'behind',
  });
  const [showSamplePhoto, setShowSamplePhoto] = useState(true);
  const [lockSquare, setLockSquare] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const dragRef = useRef<{
    handle: DragHandle | null;
    startClientX: number;
    startClientY: number;
    origFrame: FrameConfig;
  }>({
    handle: null,
    startClientX: 0,
    startClientY: 0,
    origFrame: frame,
  });

  // Load built-in sample portrait image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      sampleImgRef.current = img;
      setRenderTick((t) => t + 1);
    };
    img.src = SAMPLE_PORTRAIT_SVG;
  }, []);

  // Sync modal state when opening for create vs edit
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setIsSaving(false);
    setShowSamplePhoto(true);

    if (editingTemplate) {
      setSelectedFile(null);
      setPreviewUrl(editingTemplate.file_url);
      setImgSize({ width: editingTemplate.width, height: editingTemplate.height });
      setName(editingTemplate.name);
      setFrame({
        frame_x: editingTemplate.frame_x,
        frame_y: editingTemplate.frame_y,
        frame_width: editingTemplate.frame_width,
        frame_height: editingTemplate.frame_height,
        frame_shape: editingTemplate.frame_shape,
        layer_mode: editingTemplate.layer_mode,
      });
      setLockSquare(editingTemplate.frame_shape === 'circle');
    } else {
      setSelectedFile(null);
      setPreviewUrl(null);
      setImgSize(null);
      setName('');
      setLockSquare(false);
    }
  }, [isOpen, editingTemplate]);

  // Load template HTMLImageElement for live composite canvas preview
  useEffect(() => {
    templateImgRef.current = null;
    if (!previewUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        templateImgRef.current = img;
        setRenderTick((t) => t + 1);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        templateImgRef.current = null;
        setErrorMsg('Impossible de charger l’aperçu du template.');
      }
    };
    img.src = previewUrl;
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  // Revoke client objectUrl when replaced or modal closes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Draw live composite preview (template + optional sample portrait inside frame)
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const tplImg = templateImgRef.current;
    if (!canvas || !tplImg || !imgSize) return;

    const maxPreview = 440;
    const ratio = Math.min(1, maxPreview / Math.max(imgSize.width, imgSize.height));
    const cw = Math.max(1, Math.round(imgSize.width * ratio));
    const ch = Math.max(1, Math.round(imgSize.height * ratio));
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (showSamplePhoto && sampleImgRef.current) {
      renderBadgeToCanvas(
        ctx,
        tplImg,
        sampleImgRef.current,
        {
          width: imgSize.width,
          height: imgSize.height,
          ...frame,
        },
        DEFAULT_ADJUSTMENT,
        cw,
        ch
      );
    } else {
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(tplImg, 0, 0, cw, ch);
    }
  }, [imgSize, frame, showSamplePhoto, renderTick]);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);

    try {
      const validated = await validateAndDecodeImageFile(file, MAX_TEMPLATE_SIZE_BYTES, {
        allowWebp: true,
      });
      const detectedFrame = detectTemplateFrame(validated.image, validated.mimeType);
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();

      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      setSelectedFile(validated.file);
      setPreviewUrl(validated.objectUrl);
      setImgSize({ width: validated.width, height: validated.height });
      setName((prev) => prev.trim() || baseName || 'Nouveau template');
      setFrame(detectedFrame);
      setLockSquare(detectedFrame.frame_shape === 'circle');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Impossible de charger ce fichier template.'
      );
    }
  };

  const startFrameDrag = (handle: DragHandle, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or already-released pointer captures
    }
    dragRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origFrame: { ...frame },
    };
  };

  const onStagePointerMove = (e: React.PointerEvent) => {
    const activeHandle = dragRef.current.handle;
    if (!activeHandle || !stageRef.current || !imgSize) return;

    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = ((e.clientX - dragRef.current.startClientX) / rect.width) * imgSize.width;
    const dy = ((e.clientY - dragRef.current.startClientY) / rect.height) * imgSize.height;
    const orig = dragRef.current.origFrame;

    let nextX = orig.frame_x;
    let nextY = orig.frame_y;
    let nextW = orig.frame_width;
    let nextH = orig.frame_height;

    if (activeHandle === 'move') {
      nextX = Math.max(0, Math.min(imgSize.width - orig.frame_width, Math.round(orig.frame_x + dx)));
      nextY = Math.max(
        0,
        Math.min(imgSize.height - orig.frame_height, Math.round(orig.frame_y + dy))
      );
    } else {
      const rightEdge = orig.frame_x + orig.frame_width;
      const bottomEdge = orig.frame_y + orig.frame_height;

      if (activeHandle.includes('w')) {
        const clampedLeft = Math.max(0, Math.min(rightEdge - MIN_FRAME_PX, Math.round(orig.frame_x + dx)));
        nextX = clampedLeft;
        nextW = rightEdge - clampedLeft;
      }
      if (activeHandle.includes('e')) {
        nextW = Math.max(
          MIN_FRAME_PX,
          Math.min(imgSize.width - orig.frame_x, Math.round(orig.frame_width + dx))
        );
      }
      if (activeHandle.includes('n')) {
        const clampedTop = Math.max(
          0,
          Math.min(bottomEdge - MIN_FRAME_PX, Math.round(orig.frame_y + dy))
        );
        nextY = clampedTop;
        nextH = bottomEdge - clampedTop;
      }
      if (activeHandle.includes('s')) {
        nextH = Math.max(
          MIN_FRAME_PX,
          Math.min(imgSize.height - orig.frame_y, Math.round(orig.frame_height + dy))
        );
      }

      if (lockSquare && (activeHandle.length === 2 || activeHandle === 'e' || activeHandle === 'w')) {
        const side = Math.min(
          Math.max(nextW, nextH),
          imgSize.width - nextX,
          imgSize.height - nextY
        );
        nextW = Math.max(MIN_FRAME_PX, side);
        nextH = Math.max(MIN_FRAME_PX, side);
      }
    }

    setFrame((prev) => ({
      ...prev,
      frame_x: nextX,
      frame_y: nextY,
      frame_width: nextW,
      frame_height: nextH,
    }));
  };

  const stopFrameDrag = () => {
    dragRef.current.handle = null;
  };

  const centerFrame = () => {
    if (!imgSize) return;
    setFrame((prev) => ({
      ...prev,
      frame_x: Math.max(0, Math.round((imgSize.width - prev.frame_width) / 2)),
      frame_y: Math.max(0, Math.round((imgSize.height - prev.frame_height) / 2)),
    }));
  };

  const updateFrameField = (field: keyof FrameConfig, rawValue: number) => {
    if (!imgSize || !Number.isFinite(rawValue)) return;
    setFrame((prev) => {
      const next = { ...prev };
      if (field === 'frame_x') {
        next.frame_x = Math.max(0, Math.min(imgSize.width - MIN_FRAME_PX, Math.round(rawValue)));
        next.frame_width = Math.min(next.frame_width, imgSize.width - next.frame_x);
      } else if (field === 'frame_y') {
        next.frame_y = Math.max(0, Math.min(imgSize.height - MIN_FRAME_PX, Math.round(rawValue)));
        next.frame_height = Math.min(next.frame_height, imgSize.height - next.frame_y);
      } else if (field === 'frame_width') {
        next.frame_width = Math.max(
          MIN_FRAME_PX,
          Math.min(imgSize.width - next.frame_x, Math.round(rawValue))
        );
      } else if (field === 'frame_height') {
        next.frame_height = Math.max(
          MIN_FRAME_PX,
          Math.min(imgSize.height - next.frame_y, Math.round(rawValue))
        );
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Veuillez saisir un nom pour ce template.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTemplate) {
        await onSaveFrameEdit(editingTemplate.id, trimmedName, frame);
      } else {
        if (!selectedFile) {
          setErrorMsg('Veuillez sélectionner un fichier image PNG ou JPEG.');
          setIsSaving(false);
          return;
        }
        await onSaveNew(selectedFile, trimmedName, frame);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShapeChange = (shape: FrameShape) => {
    setFrame((prev) => {
      if (shape === 'circle' && imgSize) {
        const side = Math.min(
          prev.frame_width,
          prev.frame_height,
          imgSize.width - prev.frame_x,
          imgSize.height - prev.frame_y
        );
        return {
          ...prev,
          frame_shape: shape,
          frame_width: Math.max(MIN_FRAME_PX, side),
          frame_height: Math.max(MIN_FRAME_PX, side),
        };
      }
      return { ...prev, frame_shape: shape };
    });
    if (shape === 'circle') {
      setLockSquare(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="template-modal-title" className="text-lg font-bold text-slate-900">
            {editingTemplate
              ? 'Configurer le template et sa zone photo'
              : 'Importer un nouveau template'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-6">
          {errorMsg && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!editingTemplate && !previewUrl ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                handleFileSelect(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                isDraggingFile
                  ? 'border-teal-700 bg-teal-50/70'
                  : 'border-slate-300 bg-slate-50 hover:border-slate-400'
              }`}
            >
              <Upload className="mb-3 h-9 w-9 text-teal-700" aria-hidden="true" />
              <p className="text-base font-semibold text-slate-900">
                Déposez votre template graphique ici
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Formats acceptés : PNG, JPEG ou WebP · max{' '}
                {formatFileSize(MAX_TEMPLATE_SIZE_BYTES)}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  handleFileSelect(e.target.files?.[0]);
                  e.target.value = '';
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Choisir un fichier sur l’ordinateur
              </button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Left: Interactive Visual Preview with Draggable/Resizable Zone */}
              <div className="lg:col-span-7">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                    <Move className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                    <span>Déplacez et redimensionnez la zone sur l’aperçu</span>
                  </span>
                  {imgSize && (
                    <span className="font-mono tabular-nums">
                      {imgSize.width} × {imgSize.height} px
                    </span>
                  )}
                </div>

                <div
                  onPointerMove={onStagePointerMove}
                  onPointerUp={stopFrameDrag}
                  onPointerCancel={stopFrameDrag}
                  className="checkerboard-bg relative flex min-h-[320px] max-h-[430px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-4 select-none"
                >
                  {previewUrl && imgSize && (
                    <div
                      ref={stageRef}
                      className="relative max-h-[390px] max-w-full shadow-xs"
                      style={{
                        aspectRatio: `${imgSize.width} / ${imgSize.height}`,
                      }}
                    >
                      <canvas
                        ref={previewCanvasRef}
                        className="block h-full w-full"
                        aria-label="Aperçu du template et de l'insertion photo"
                      />

                      {/* Draggable & Resizable Photo Zone Overlay */}
                      <div
                        role="region"
                        aria-label="Zone réservée à la photo"
                        onPointerDown={(e) => startFrameDrag('move', e)}
                        className="absolute cursor-move touch-none border-2 border-teal-600 bg-teal-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.18)]"
                        style={{
                          left: `${(frame.frame_x / imgSize.width) * 100}%`,
                          top: `${(frame.frame_y / imgSize.height) * 100}%`,
                          width: `${(frame.frame_width / imgSize.width) * 100}%`,
                          height: `${(frame.frame_height / imgSize.height) * 100}%`,
                          borderRadius:
                            frame.frame_shape === 'circle'
                              ? '9999px'
                              : frame.frame_shape === 'rounded'
                              ? '8%'
                              : '0px',
                        }}
                      >
                        {/* 4 Corner Handles */}
                        <button
                          type="button"
                          aria-label="Redimensionner coin haut gauche"
                          onPointerDown={(e) => startFrameDrag('nw', e)}
                          className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-xs border border-teal-800 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Redimensionner coin haut droit"
                          onPointerDown={(e) => startFrameDrag('ne', e)}
                          className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 cursor-nesw-resize rounded-xs border border-teal-800 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Redimensionner coin bas gauche"
                          onPointerDown={(e) => startFrameDrag('sw', e)}
                          className="absolute -bottom-1.5 -left-1.5 h-3.5 w-3.5 cursor-nesw-resize rounded-xs border border-teal-800 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Redimensionner coin bas droit"
                          onPointerDown={(e) => startFrameDrag('se', e)}
                          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-xs border border-teal-800 bg-white"
                        />

                        {/* 4 Edge Handles */}
                        <button
                          type="button"
                          aria-label="Redimensionner bord haut"
                          onPointerDown={(e) => startFrameDrag('n', e)}
                          className="absolute -top-1 left-1/2 h-2.5 w-5 -translate-x-1/2 cursor-ns-resize rounded-xs border border-teal-800 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Redimensionner bord bas"
                          onPointerDown={(e) => startFrameDrag('s', e)}
                          className="absolute -bottom-1 left-1/2 h-2.5 w-5 -translate-x-1/2 cursor-ns-resize rounded-xs border border-teal-800 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Redimensionner bord gauche"
                          onPointerDown={(e) => startFrameDrag('w', e)}
                          className="absolute -left-1 top-1/2 h-5 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-xs border border-teal-800 bg-white"
                        />
                        <button
                          type="button"
                          aria-label="Redimensionner bord droit"
                          onPointerDown={(e) => startFrameDrag('e', e)}
                          className="absolute -right-1 top-1/2 h-5 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-xs border border-teal-800 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview helpers */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={showSamplePhoto}
                        onChange={(e) => setShowSamplePhoto(e.target.checked)}
                        className="accent-teal-700"
                      />
                      <Eye className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                      <span>Aperçu avec photo témoin</span>
                    </label>

                    <button
                      type="button"
                      onClick={centerFrame}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-teal-800"
                    >
                      <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Centrer la zone</span>
                    </button>
                  </div>

                  {!editingTemplate && (
                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap shrink-0"
                      >
                        Changer de fichier
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          handleFileSelect(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                        className="sr-only"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Template Name & Frame Zone Settings */}
              <div className="flex flex-col gap-4 lg:col-span-5">
                <div>
                  <label
                    htmlFor="template-name-input"
                    className="mb-1.5 block text-sm font-semibold text-slate-900"
                  >
                    Nom du template
                  </label>
                  <input
                    id="template-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex. : J'y serai — Forum 2026"
                    maxLength={120}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-semibold text-slate-900">
                    Forme du cadre photo
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
                    {(
                      [
                        { id: 'rect', label: 'Rectangle' },
                        { id: 'rounded', label: 'Arrondi' },
                        { id: 'circle', label: 'Cercle' },
                      ] as Array<{ id: FrameShape; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleShapeChange(opt.id)}
                        className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                          frame.frame_shape === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-semibold text-slate-900">
                    Superposition de la photo
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                    {(
                      [
                        { id: 'front', label: 'Devant le template' },
                        { id: 'behind', label: 'Derrière (trou PNG)' },
                      ] as Array<{ id: LayerMode; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFrame((prev) => ({ ...prev, layer_mode: opt.id }))}
                        className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                          frame.layer_mode === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                    Choisissez « Devant le template » si votre image de fond est opaque (JPEG ou PNG
                    plein), ou « Derrière » si votre PNG comporte une découpe transparente.
                  </p>
                </div>

                {imgSize && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={lockSquare}
                        onChange={(e) => setLockSquare(e.target.checked)}
                        className="accent-teal-700"
                      />
                      <span>Conserver les proportions carrées (1:1) lors du redimensionnement</span>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="template-frame-x"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Position X (px)
                        </label>
                        <input
                          id="template-frame-x"
                          type="number"
                          min={0}
                          max={imgSize.width - MIN_FRAME_PX}
                          value={frame.frame_x}
                          onChange={(e) => updateFrameField('frame_x', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="template-frame-y"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Position Y (px)
                        </label>
                        <input
                          id="template-frame-y"
                          type="number"
                          min={0}
                          max={imgSize.height - MIN_FRAME_PX}
                          value={frame.frame_y}
                          onChange={(e) => updateFrameField('frame_y', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="template-frame-width"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Largeur cadre (px)
                        </label>
                        <input
                          id="template-frame-width"
                          type="number"
                          min={MIN_FRAME_PX}
                          max={imgSize.width}
                          value={frame.frame_width}
                          onChange={(e) => updateFrameField('frame_width', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="template-frame-height"
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Hauteur cadre (px)
                        </label>
                        <input
                          id="template-frame-height"
                          type="number"
                          min={MIN_FRAME_PX}
                          max={imgSize.height}
                          value={frame.frame_height}
                          onChange={(e) => updateFrameField('frame_height', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving || (!editingTemplate && !selectedFile)}
              className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? 'Enregistrement...'
                : editingTemplate
                ? 'Mettre à jour'
                : 'Enregistrer le template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
