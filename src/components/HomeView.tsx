import { ArrowRight, Layers, Lock, Plus, Sliders } from 'lucide-react';
import type { AppView, TemplateDTO } from '../types/doolee.ts';
import { formatFileSize, formatMimeLabel } from '../lib/fileValidation.ts';

interface HomeViewProps {
  templates: TemplateDTO[];
  isLoadingTemplates: boolean;
  onUseTemplate: (template: TemplateDTO) => void;
  onOpenImportTemplate: () => void;
  onNavigate: (view: AppView) => void;
}

export function HomeView({
  templates,
  isLoadingTemplates,
  onUseTemplate,
  onOpenImportTemplate,
  onNavigate,
}: HomeViewProps) {
  const featuredTemplates = templates
    .filter((tpl): tpl is TemplateDTO => Boolean(tpl && tpl.id && tpl.file_url))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      {/* Split Architectural Hero */}
      <section className="grid items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col justify-center lg:col-span-7">
          <img
            src="/assets/aistudio/Doolee__3__7f4b2cc1.png"
            alt="Doolee"
            referrerPolicy="no-referrer"
            className="mb-4 h-10 w-auto self-start object-contain select-none sm:h-11"
          />
          <p className="text-sm font-semibold tracking-wide text-teal-800">
            Atelier de badges événementiels
          </p>
          <h1 className="mt-2.5 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
            Produisez vos visuels personnalisés en série, sans quitter votre navigateur.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
            Importez un template graphique (« J’y serai », « J’y étais », « Je participe »),
            ajustez plusieurs photographies en temps réel et téléchargez vos badges individuels ou
            en archive ZIP. Vos photographies restent strictement sur votre appareil.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              <span>Accéder au studio</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenImportTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Importer un template</span>
            </button>
          </div>
        </div>

        {/* Visual Showcase Column */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs text-slate-500">
            <span className="font-medium text-slate-800">Architecture de traitement</span>
            <span className="font-mono tabular-nums">100 % local pour les photos</span>
          </div>

          <div className="my-6 flex items-center justify-center">
            <div className="grid w-full max-w-sm grid-cols-2 gap-4">
              {/* Template layer diagram */}
              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="checkerboard-bg flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200">
                  {featuredTemplates[0] ? (
                    <img
                      src={featuredTemplates[0].file_url}
                      alt={featuredTemplates[0].name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Layers className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                <span className="mt-2.5 text-xs font-semibold text-slate-800">
                  Template serveur
                </span>
                <span className="text-[11px] text-slate-500">Enregistré en SQLite</span>
              </div>

              {/* Client photo composition diagram */}
              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
                  <svg
                    viewBox="0 0 120 120"
                    className="h-full w-full"
                    aria-label="Illustration du cadrage local"
                  >
                    <rect x="6" y="6" width="108" height="108" rx="12" fill="#0F766E" />
                    <circle cx="60" cy="56" r="32" fill="#F8FAFC" />
                    <circle cx="60" cy="48" r="11" fill="#94A3B8" />
                    <path d="M40 78 C40 65, 80 65, 80 78" fill="#94A3B8" />
                    <rect x="24" y="96" width="72" height="8" rx="4" fill="#CCFBF1" />
                  </svg>
                </div>
                <span className="mt-2.5 text-xs font-semibold text-slate-800">
                  Rendu navigateur
                </span>
                <span className="text-[11px] text-slate-500">PNG · JPEG · Archive ZIP</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <Lock className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
            <span>
              Aucune photographie importée n’est transmise au serveur ni stockée en base de données.
            </span>
          </div>
        </div>
      </section>

      {/* 3-Step Workflow Summary */}
      <section className="mt-12 grid gap-6 border-y border-slate-200 py-8 md:grid-cols-3">
        <div className="flex items-start gap-3.5">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">01. Choisir un seul template</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Sélectionnez un modèle enregistré ou importez votre visuel PNG/JPEG avant de démarrer
              une session.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5">
          <Sliders className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">02. Ajuster chaque photographie</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Importez vos photos par glisser-déposer, recadrez et zoomez en temps réel sans altérer
              le modèle d’origine.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">03. Générer et télécharger</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Vérifiez l’aperçu des badges haute résolution puis téléchargez à l’unité ou en lot
              ZIP.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Access to Saved Templates */}
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Templates enregistrés</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sélectionnez directement un modèle pour démarrer une session de génération.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('templates')}
            className="text-sm font-semibold text-teal-800 hover:text-teal-900 hover:underline whitespace-nowrap shrink-0"
          >
            Gérer tous les templates ({templates.length})
          </button>
        </div>

        {isLoadingTemplates ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : featuredTemplates.length === 0 ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              Aucun template enregistré pour le moment.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Importez votre premier modèle graphique PNG ou JPEG pour commencer.
            </p>
            <button
              type="button"
              onClick={onOpenImportTemplate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Importer un template</span>
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredTemplates.map((tpl) => (
              <article
                key={tpl.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300"
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
                    <h3 className="truncate text-base font-bold text-slate-900">{tpl.name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span>
                        {tpl.width} × {tpl.height} px
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMimeLabel(tpl.mime_type)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFileSize(tpl.file_size)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUseTemplate(tpl)}
                    className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                  >
                    Utiliser ce template
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
