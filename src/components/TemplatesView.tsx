import { Check, Crop, ImageOff, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { formatFileSize, formatMimeLabel } from '../lib/fileValidation.ts';
import type { TemplateDTO } from '../types/doolee.ts';

interface TemplatesViewProps {
  templates: TemplateDTO[];
  isLoading: boolean;
  activeTemplateId: string | null;
  onOpenImportTemplate: () => void;
  onEditTemplateFrame: (template: TemplateDTO) => void;
  onUseTemplate: (template: TemplateDTO) => void;
  onRenameTemplate: (id: string, newName: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export function TemplatesView({
  templates,
  isLoading,
  activeTemplateId,
  onOpenImportTemplate,
  onEditTemplateFrame,
  onUseTemplate,
  onRenameTemplate,
  onDeleteTemplate,
}: TemplatesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const validTemplates = templates.filter(
    (tpl): tpl is TemplateDTO => Boolean(tpl && tpl.id && tpl.file_url)
  );
  const filtered = validTemplates.filter((tpl) =>
    tpl.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const startRename = (tpl: TemplateDTO) => {
    setConfirmDeleteId(null);
    setRenamingId(tpl.id);
    setRenameDraft(tpl.name);
  };

  const commitRename = async (id: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    setBusyId(id);
    try {
      await onRenameTemplate(id, trimmed);
      setRenamingId(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await onDeleteTemplate(id);
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Gestion des templates
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Modèles graphiques conservés de manière persistante sur le serveur (
            <span className="font-mono tabular-nums">{templates.length}</span>{' '}
            {templates.length > 1 ? 'disponibles' : 'disponible'}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {templates.length > 0 && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un template..."
                aria-label="Rechercher un template"
                className="w-56 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onOpenImportTemplate}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Importer un template</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-base font-semibold text-slate-900">
            {templates.length === 0
              ? 'Aucun template enregistré'
              : 'Aucun template ne correspond à votre recherche'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {templates.length === 0
              ? 'Importez un visuel PNG ou JPEG depuis votre ordinateur pour commencer à générer des badges.'
              : 'Essayez un autre mot-clé ou réinitialisez le filtre.'}
          </p>
          {templates.length === 0 && (
            <button
              type="button"
              onClick={onOpenImportTemplate}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Importer un template</span>
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl) => {
            const isRenaming = renamingId === tpl.id;
            const isConfirmingDelete = confirmDeleteId === tpl.id;
            const isBusy = busyId === tpl.id;
            const isActiveInSession = activeTemplateId === tpl.id;

            return (
              <article
                key={tpl.id}
                className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
                  isActiveInSession ? 'border-teal-700' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="checkerboard-bg relative flex aspect-[4/3] w-full items-center justify-center border-b border-slate-200 p-4">
                  {brokenImages[tpl.id] ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ImageOff className="h-8 w-8" aria-hidden="true" />
                      <span className="text-xs">Aperçu indisponible</span>
                    </div>
                  ) : (
                    <img
                      src={tpl.file_url}
                      alt={tpl.name}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenImages((prev) => ({ ...prev, [tpl.id]: true }))}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(tpl.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          maxLength={120}
                          aria-label="Nouveau nom du template"
                          className="min-w-0 flex-1 rounded-lg border border-teal-700 px-2.5 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => commitRename(tpl.id)}
                          disabled={isBusy || !renameDraft.trim()}
                          aria-label="Valider le renommage"
                          className="rounded-lg bg-teal-700 p-1.5 text-white hover:bg-teal-800 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          aria-label="Annuler le renommage"
                          className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-base font-bold text-slate-900" title={tpl.name}>
                          {tpl.name}
                        </h2>
                        <button
                          type="button"
                          onClick={() => startRename(tpl)}
                          aria-label={`Renommer ${tpl.name}`}
                          title="Renommer"
                          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 shrink-0"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span>
                        {tpl.width} × {tpl.height} px
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMimeLabel(tpl.mime_type)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFileSize(tpl.file_size)}</span>
                    </div>

                    {isActiveInSession && (
                      <p className="mt-2 text-xs font-semibold text-teal-800">
                        Sélectionné pour la session en cours
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onUseTemplate(tpl)}
                      className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                    >
                      Utiliser ce template
                    </button>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onEditTemplateFrame(tpl)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Zone photo</span>
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDelete(tpl.id)}
                            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(tpl.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Supprimer</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
