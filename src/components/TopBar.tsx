import { Plus } from 'lucide-react';
import type { AppView } from '../types/doolee.ts';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenImportTemplate: () => void;
  hasResults: boolean;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'home', label: 'Accueil' },
  { id: 'templates', label: 'Templates' },
  { id: 'studio', label: 'Studio' },
  { id: 'results', label: 'Résultats' },
];

export function TopBar({
  activeView,
  onNavigate,
  onOpenImportTemplate,
  hasResults,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark Logo */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Accueil Doolee"
          className="flex items-center shrink-0 rounded-md py-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
        >
          <img
            src="/assets/aistudio/Doolee__3__7f4b2cc1.png"
            alt="Doolee"
            referrerPolicy="no-referrer"
            className="h-7 w-auto object-contain select-none"
          />
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Navigation principale"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            const isMuted = item.id === 'results' && !hasResults;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'text-teal-800 font-semibold'
                    : isMuted
                    ? 'text-slate-400 hover:text-slate-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-3.5 h-0.5 bg-teal-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenImportTemplate}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:bg-teal-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Importer un template</span>
          </button>
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Navigation mobile"
        className="flex md:hidden items-center justify-around border-t border-slate-100 px-2 py-1.5 text-xs font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-teal-50 text-teal-800 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
