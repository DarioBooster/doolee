import { useCallback, useEffect, useRef, useState } from 'react';
import { HomeView } from './components/HomeView.tsx';
import { ResultsView } from './components/ResultsView.tsx';
import { StudioView } from './components/StudioView.tsx';
import { TemplateModal } from './components/TemplateModal.tsx';
import { TemplatesView } from './components/TemplatesView.tsx';
import { ToastList } from './components/ToastList.tsx';
import { TopBar } from './components/TopBar.tsx';
import {
  deleteTemplate,
  fetchTemplates,
  updateTemplate,
  uploadTemplate,
} from './lib/api.ts';
import {
  MAX_BATCH_PHOTOS,
  MAX_PHOTO_SIZE_BYTES,
  validateAndDecodeImageFile,
} from './lib/fileValidation.ts';
import {
  createThumbnailUrl,
  DEFAULT_ADJUSTMENT,
  generateBadgesBatch,
} from './lib/imageEngine.ts';
import type {
  AppView,
  FrameConfig,
  GeneratedBadge,
  PhotoAdjustment,
  SessionPhoto,
  TemplateDTO,
  ToastNotice,
} from './types/doolee.ts';

function revokePhotoUrls(photo: SessionPhoto) {
  URL.revokeObjectURL(photo.objectUrl);
  URL.revokeObjectURL(photo.thumbnailUrl);
}

function revokeBadgesUrls(badges: GeneratedBadge[]) {
  for (const badge of badges) {
    URL.revokeObjectURL(badge.previewUrl);
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  // Template import / frame editor modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateDTO | null>(null);

  // Strict single-template session state (photos are ephemeral, browser-only)
  const [activeTemplate, setActiveTemplate] = useState<TemplateDTO | null>(null);
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImportingPhotos, setIsImportingPhotos] = useState(false);

  // Generated badges state (ephemeral, browser-only)
  const [generatedBadges, setGeneratedBadges] = useState<GeneratedBadge[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  // Toast notices
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  // Refs to clean up all temporary ObjectURLs on unmount / page unload
  const photosRef = useRef<SessionPhoto[]>([]);
  const badgesRef = useRef<GeneratedBadge[]>([]);
  photosRef.current = photos;
  badgesRef.current = generatedBadges;

  const notify = useCallback((type: ToastNotice['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load persisted templates from SQLite backend
  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const list = await fetchTemplates();
      setTemplates(list);
    } catch (err) {
      notify(
        'error',
        err instanceof Error ? err.message : 'Impossible de charger les templates.'
      );
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [notify]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Free all temporary browser ObjectURLs when closing tab or unmounting
  useEffect(() => {
    const cleanupAll = () => {
      for (const p of photosRef.current) {
        revokePhotoUrls(p);
      }
      revokeBadgesUrls(badgesRef.current);
    };

    window.addEventListener('beforeunload', cleanupAll);
    return () => {
      window.removeEventListener('beforeunload', cleanupAll);
      cleanupAll();
    };
  }, []);

  const clearGeneratedBadges = useCallback(() => {
    setGeneratedBadges((prev) => {
      revokeBadgesUrls(prev);
      return [];
    });
  }, []);

  const clearSessionPhotos = useCallback(() => {
    setPhotos((prev) => {
      for (const p of prev) {
        revokePhotoUrls(p);
      }
      return [];
    });
    setSelectedPhotoId(null);
    setImportErrors([]);
    clearGeneratedBadges();
  }, [clearGeneratedBadges]);

  const handleSelectTemplateForSession = (tpl: TemplateDTO) => {
    if (activeTemplate && activeTemplate.id !== tpl.id && photos.length > 0) {
      // Enforce single-template session rule cleanly
      clearSessionPhotos();
      notify('info', `Nouvelle session démarrée avec « ${tpl.name} ».`);
    } else {
      clearGeneratedBadges();
    }
    setActiveTemplate(tpl);
    setActiveView('studio');
  };

  const handleResetSessionTemplate = () => {
    clearSessionPhotos();
    setActiveTemplate(null);
    notify('info', 'Session réinitialisée. Sélectionnez un nouveau template.');
  };

  const handleSaveNewTemplate = async (file: File, name: string, frame: FrameConfig) => {
    const created = await uploadTemplate(file, name, frame);
    setTemplates((prev) => [created, ...prev]);
    notify('success', `Template « ${created.name} » enregistré.`);
  };

  const handleSaveTemplateEdit = async (
    templateId: string,
    name: string,
    frame: FrameConfig
  ) => {
    const updated = await updateTemplate(templateId, { name, ...frame });
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (activeTemplate?.id === updated.id) {
      setActiveTemplate(updated);
      clearGeneratedBadges();
    }
    notify('success', `Configuration de « ${updated.name} » mise à jour.`);
  };

  const handleRenameTemplate = async (id: string, newName: string) => {
    try {
      const updated = await updateTemplate(id, { name: newName });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (activeTemplate?.id === updated.id) {
        setActiveTemplate(updated);
      }
      notify('success', `Template renommé en « ${updated.name} ».`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Échec du renommage.');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const target = templates.find((t) => t.id === id);
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      // Rule 18: deleting a template never deletes user's loaded photos
      if (activeTemplate?.id === id) {
        setActiveTemplate(null);
        clearGeneratedBadges();
        notify(
          'info',
          `Template « ${target?.name ?? ''} » supprimé. Vos photographies restent chargées ; choisissez un autre template pour générer.`
        );
      } else {
        notify('success', `Template « ${target?.name ?? ''} » supprimé.`);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Impossible de supprimer le template.');
    }
  };

  const handleImportPhotos = async (fileList: FileList | File[]) => {
    if (!activeTemplate) {
      notify('error', 'Veuillez d’abord sélectionner un template avant d’importer des photos.');
      return;
    }

    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const remainingSlots = MAX_BATCH_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setImportErrors([
        `Limite atteinte : maximum ${MAX_BATCH_PHOTOS} photographies par session pour préserver la fluidité du navigateur.`,
      ]);
      return;
    }

    setIsImportingPhotos(true);
    const errors: string[] = [];
    const added: SessionPhoto[] = [];

    const filesToProcess = incoming.slice(0, remainingSlots);
    if (incoming.length > remainingSlots) {
      errors.push(
        `${incoming.length - remainingSlots} fichier(s) ignoré(s) : la session est limitée à ${MAX_BATCH_PHOTOS} photographies.`
      );
    }

    for (const file of filesToProcess) {
      try {
        const validated = await validateAndDecodeImageFile(file, MAX_PHOTO_SIZE_BYTES);
        let thumbnailUrl: string;
        try {
          thumbnailUrl = await createThumbnailUrl(validated.image);
        } catch (thumbErr) {
          URL.revokeObjectURL(validated.objectUrl);
          throw thumbErr;
        }

        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file: validated.file,
          fileName: validated.file.name,
          fileSize: validated.file.size,
          mimeType: validated.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
          objectUrl: validated.objectUrl,
          thumbnailUrl,
          naturalWidth: validated.width,
          naturalHeight: validated.height,
          adjustment: { ...DEFAULT_ADJUSTMENT },
        });
      } catch (err) {
        errors.push(
          err instanceof Error
            ? err.message
            : `Impossible de lire le fichier « ${file.name} ».`
        );
      }
    }

    if (added.length > 0) {
      setPhotos((prev) => [...prev, ...added]);
      setSelectedPhotoId((prevId) => prevId ?? added[0].id);
      clearGeneratedBadges();
      notify(
        'success',
        `${added.length} ${added.length > 1 ? 'photographies ajoutées' : 'photographie ajoutée'} localement.`
      );
    }

    if (errors.length > 0) {
      setImportErrors(errors);
      notify('error', `${errors.length} fichier(s) incompatible(s) ou illisible(s).`);
    } else {
      setImportErrors([]);
    }

    setIsImportingPhotos(false);
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) {
        revokePhotoUrls(target);
      }
      const next = prev.filter((p) => p.id !== photoId);
      if (selectedPhotoId === photoId) {
        setSelectedPhotoId(next[0]?.id ?? null);
      }
      return next;
    });
    clearGeneratedBadges();
  };

  const handleUpdateAdjustment = (photoId: string, adjustment: PhotoAdjustment) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, adjustment } : p))
    );
  };

  const handleResetAdjustment = (photoId: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, adjustment: { ...DEFAULT_ADJUSTMENT } } : p))
    );
  };

  const handleGenerateBadges = async () => {
    if (!activeTemplate) {
      notify('error', 'Aucun template sélectionné.');
      return;
    }
    if (photos.length === 0) {
      notify('error', 'Importez au moins une photographie avant de générer.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ completed: 0, total: photos.length });
    clearGeneratedBadges();

    try {
      const generated = await generateBadgesBatch(activeTemplate, photos, (completed, total) => {
        setGenerationProgress({ completed, total });
      });
      setGeneratedBadges(generated);
      setActiveView('results');
      notify(
        'success',
        `${generated.length} ${generated.length > 1 ? 'badges générés' : 'badge généré'} avec succès.`
      );
    } catch (err) {
      notify(
        'error',
        err instanceof Error ? err.message : 'Erreur lors de la génération des badges.'
      );
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleToggleBadgeSelect = (badgeId: string) => {
    setGeneratedBadges((prev) =>
      prev.map((b) => (b.id === badgeId ? { ...b, selected: !b.selected } : b))
    );
  };

  const handleSetAllBadgesSelected = (selected: boolean) => {
    setGeneratedBadges((prev) => prev.map((b) => ({ ...b, selected })));
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeView={activeView}
        onNavigate={setActiveView}
        onOpenImportTemplate={() => {
          setEditingTemplate(null);
          setTemplateModalOpen(true);
        }}
        hasResults={generatedBadges.length > 0}
      />

      <main className="flex-1">
        {activeView === 'home' && (
          <HomeView
            templates={templates}
            isLoadingTemplates={isLoadingTemplates}
            onUseTemplate={handleSelectTemplateForSession}
            onOpenImportTemplate={() => {
              setEditingTemplate(null);
              setTemplateModalOpen(true);
            }}
            onNavigate={setActiveView}
          />
        )}

        {activeView === 'templates' && (
          <TemplatesView
            templates={templates}
            isLoading={isLoadingTemplates}
            activeTemplateId={activeTemplate?.id ?? null}
            onOpenImportTemplate={() => {
              setEditingTemplate(null);
              setTemplateModalOpen(true);
            }}
            onEditTemplateFrame={(tpl) => {
              setEditingTemplate(tpl);
              setTemplateModalOpen(true);
            }}
            onUseTemplate={handleSelectTemplateForSession}
            onRenameTemplate={handleRenameTemplate}
            onDeleteTemplate={handleDeleteTemplate}
          />
        )}

        {activeView === 'studio' && (
          <StudioView
            templates={templates}
            activeTemplate={activeTemplate}
            photos={photos}
            selectedPhotoId={selectedPhotoId}
            importErrors={importErrors}
            isImportingPhotos={isImportingPhotos}
            isGenerating={isGenerating}
            generationProgress={generationProgress}
            onSelectTemplateForSession={handleSelectTemplateForSession}
            onResetSessionTemplate={handleResetSessionTemplate}
            onOpenImportTemplate={() => {
              setEditingTemplate(null);
              setTemplateModalOpen(true);
            }}
            onEditActiveTemplateFrame={(tpl) => {
              setEditingTemplate(tpl);
              setTemplateModalOpen(true);
            }}
            onImportPhotos={handleImportPhotos}
            onDismissImportErrors={() => setImportErrors([])}
            onSelectPhoto={setSelectedPhotoId}
            onRemovePhoto={handleRemovePhoto}
            onUpdateAdjustment={handleUpdateAdjustment}
            onResetAdjustment={handleResetAdjustment}
            onGenerateBadges={handleGenerateBadges}
          />
        )}

        {activeView === 'results' && (
          <ResultsView
            badges={generatedBadges}
            activeTemplate={activeTemplate}
            onToggleSelect={handleToggleBadgeSelect}
            onSetAllSelected={handleSetAllBadgesSelected}
            onBackToStudio={() => setActiveView('studio')}
            onNotify={notify}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/aistudio/Doolee__3__7f4b2cc1.png"
              alt="Doolee"
              referrerPolicy="no-referrer"
              className="h-4 w-auto object-contain select-none"
            />
            <span>— Générateur de badges événementiels</span>
          </div>
          <span>Traitement des photographies exécuté exclusivement dans votre navigateur</span>
        </div>
      </footer>

      <TemplateModal
        isOpen={templateModalOpen}
        editingTemplate={editingTemplate}
        onClose={() => setTemplateModalOpen(false)}
        onSaveNew={handleSaveNewTemplate}
        onSaveFrameEdit={handleSaveTemplateEdit}
      />

      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
