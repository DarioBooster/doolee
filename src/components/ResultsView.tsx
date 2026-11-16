import { ArrowLeft, CheckSquare, Download, FileArchive, Square } from 'lucide-react';
import { useState } from 'react';
import { convertPngBlobToJpeg } from '../lib/imageEngine.ts';
import {
  createBadgesZip,
  slugifyFilename,
  triggerBlobDownload,
  type ExportFormat,
} from '../lib/zipExport.ts';
import type { GeneratedBadge, TemplateDTO } from '../types/doolee.ts';

interface ResultsViewProps {
  badges: GeneratedBadge[];
  activeTemplate: TemplateDTO | null;
  onToggleSelect: (badgeId: string) => void;
  onSetAllSelected: (selected: boolean) => void;
  onBackToStudio: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function ResultsView({
  badges,
  activeTemplate,
  onToggleSelect,
  onSetAllSelected,
  onBackToStudio,
  onNotify,
}: ResultsViewProps) {
  const [zipFormat, setZipFormat] = useState<ExportFormat>('png');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ completed: number; total: number } | null>(null);
  const [busyBadgeId, setBusyBadgeId] = useState<string | null>(null);

  const selectedBadges = badges.filter((b) => b.selected);
  const allSelected = badges.length > 0 && selectedBadges.length === badges.length;

  if (badges.length === 0) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <h1 className="font-display text-xl font-bold text-slate-900">
            Aucun badge généré pour le moment
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sélectionnez un template et importez vos photographies dans le studio pour générer vos
            badges personnalisés.
          </p>
          <button
            type="button"
            onClick={onBackToStudio}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Aller au studio</span>
          </button>
        </div>
      </div>
    );
  }

  const handleDownloadIndividual = async (badge: GeneratedBadge, format: ExportFormat) => {
    setBusyBadgeId(badge.id);
    try {
      if (format === 'png') {
        triggerBlobDownload(badge.pngBlob, `${badge.fileNameBase}.png`);
        onNotify('success', `Badge ${badge.fileNameBase}.png téléchargé.`);
      } else {
        const jpegBlob = await convertPngBlobToJpeg(badge.pngBlob, badge.width, badge.height);
        triggerBlobDownload(jpegBlob, `${badge.fileNameBase}.jpg`);
        onNotify('success', `Badge ${badge.fileNameBase}.jpg téléchargé.`);
      }
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Erreur lors du téléchargement du badge.'
      );
    } finally {
      setBusyBadgeId(null);
    }
  };

  const handleDownloadZip = async (targetBadges: GeneratedBadge[]) => {
    if (targetBadges.length === 0) {
      onNotify('error', 'Sélectionnez au moins un badge avant de créer l’archive ZIP.');
      return;
    }

    setIsExportingZip(true);
    setZipProgress({ completed: 0, total: targetBadges.length });
    try {
      const zipBlob = await createBadgesZip(targetBadges, zipFormat, (completed, total) => {
        setZipProgress({ completed, total });
      });
      const templateSlug = slugifyFilename(activeTemplate?.name || 'badges');
      const archiveName = `doolee_${templateSlug}_${targetBadges.length}_badges.zip`;
      triggerBlobDownload(zipBlob, archiveName);
      onNotify(
        'success',
        `Archive ZIP créée avec ${targetBadges.length} badge(s) (${zipFormat.toUpperCase()}).`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Échec de la création de l’archive ZIP.'
      );
    } finally {
      setIsExportingZip(false);
      setZipProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header & Return to Customization */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <button
            type="button"
            onClick={onBackToStudio}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Revenir à la personnalisation</span>
          </button>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Galerie des badges générés
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-mono tabular-nums">{badges.length}</span>{' '}
            {badges.length > 1 ? 'badges prêts' : 'badge prêt'} au format natif{' '}
            <span className="font-mono tabular-nums">
              {badges[0].width} × {badges[0].height} px
            </span>
            . Vérifiez le rendu puis téléchargez individuellement ou en archive ZIP.
          </p>
        </div>

        {/* Batch ZIP Controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['png', 'jpeg'] as ExportFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setZipFormat(fmt)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                  zipFormat === fmt
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isExportingZip || selectedBadges.length === 0}
            onClick={() => handleDownloadZip(selectedBadges)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileArchive className="h-4 w-4" aria-hidden="true" />
            <span>
              {isExportingZip && zipProgress
                ? `ZIP (${zipProgress.completed}/${zipProgress.total})...`
                : `Télécharger la sélection (${selectedBadges.length})`}
            </span>
          </button>

          <button
            type="button"
            disabled={isExportingZip}
            onClick={() => handleDownloadZip(badges)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Tout télécharger (ZIP)</span>
          </button>
        </div>
      </div>

      {/* Selection Bar */}
      <div className="mt-5 flex items-center justify-between text-xs text-slate-600">
        <button
          type="button"
          onClick={() => onSetAllSelected(!allSelected)}
          className="inline-flex items-center gap-2 font-semibold text-slate-800 hover:text-teal-800"
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-teal-700" aria-hidden="true" />
          ) : (
            <Square className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
          <span>{allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
        </button>

        <span className="font-mono tabular-nums">
          {selectedBadges.length} / {badges.length} sélectionné(s)
        </span>
      </div>

      {/* Badges Grid */}
      <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((badge) => {
          const isBusy = busyBadgeId === badge.id;
          return (
            <article
              key={badge.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
                badge.selected ? 'border-teal-700' : 'border-slate-200'
              }`}
            >
              <div className="checkerboard-bg relative flex aspect-square w-full items-center justify-center border-b border-slate-200 p-3">
                <img
                  src={badge.previewUrl}
                  alt={`Badge ${badge.fileNameBase}`}
                  className="max-h-full max-w-full rounded object-contain shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => onToggleSelect(badge.id)}
                  aria-label={
                    badge.selected
                      ? `Désélectionner ${badge.fileNameBase}`
                      : `Sélectionner ${badge.fileNameBase}`
                  }
                  className="absolute left-3 top-3 rounded-lg bg-white/95 p-1.5 text-slate-700 shadow-xs transition-colors hover:bg-white"
                >
                  {badge.selected ? (
                    <CheckSquare className="h-5 w-5 text-teal-700" aria-hidden="true" />
                  ) : (
                    <Square className="h-5 w-5 text-slate-400" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <h2 className="font-mono text-sm font-bold text-slate-900">
                    {badge.fileNameBase}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Source : {badge.sourcePhotoName}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDownloadIndividual(badge, 'png')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>PNG</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDownloadIndividual(badge, 'jpeg')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>JPEG</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
