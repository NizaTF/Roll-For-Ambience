import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  FolderCheck,
  FolderPlus,
  MoreVertical,
  Music2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatDuration } from '../services/freeMusicApi';
import { Folder, FolderIconName, Track } from '../types/audio';
import { FolderIcon } from './FolderIcon';
import { FolderIconGallery } from './FolderIconGallery';

interface LibraryViewProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  activeFolder: Folder | null;
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  getFoldersContainingTrack: (trackId: string) => string[];
  onPlayTrack: (track: Track, queue: Track[], queueName: string) => void;
  onTogglePlay: () => void;
  onCreateFolder: (name: string, icon: FolderIconName) => void;
  onUpdateFolder: (
    folderId: string,
    updates: { name?: string; icon?: FolderIconName }
  ) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenFolderPicker: (track: Track) => void;
  onRemoveTrackFromFolder: (trackId: string, folderId: string) => void;
  onMoveTrack: (folderId: string, trackId: string, dir: 'up' | 'down') => void;
  onExportPlaylist: (folderId: string) => string;
  onExportBackup: () => string;
  onImportListOrBackup: (json: string) => { ok: boolean; message: string };
  onResetStarter: () => void;
  onGoToSearch: () => void;
}

function sourceLabel(source: Track['source']): string {
  switch (source) {
    case 'youtube':
      return 'YouTube';
    case 'audius':
      return 'Audius';
    case 'local':
      return 'Archivo local';
    case 'direct':
    default:
      return 'Enlace libre';
  }
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  activeFolder,
  tracks,
  currentTrack,
  isPlaying,
  getFoldersContainingTrack,
  onPlayTrack,
  onTogglePlay,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onOpenFolderPicker,
  onRemoveTrackFromFolder,
  onMoveTrack,
  onExportPlaylist,
  onExportBackup,
  onImportListOrBackup,
  onResetStarter,
  onGoToSearch,
}) => {
  const [filterText, setFilterText] = useState('');

  // Create folder modal
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<FolderIconName>('sword');

  // Edit active folder modal (name + icon)
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<FolderIconName>('music');

  // Options / Import-Export modal
  const [showFolderOptions, setShowFolderOptions] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredTracks = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
    );
  }, [filterText, tracks]);

  const queueTitle = activeFolder ? activeFolder.name : 'Todas las canciones';

  const showNotice = (ok: boolean, text: string) => {
    setBackupNotice({ ok, text });
    window.setTimeout(() => setBackupNotice(null), 3200);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateFolder(newName.trim(), newIcon);
    setNewName('');
    setNewIcon('sword');
    setShowNewFolderModal(false);
  };

  const openEditFolder = () => {
    if (!activeFolder) return;
    setEditName(activeFolder.name);
    setEditIcon(activeFolder.icon);
    setShowEditFolderModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolder || !editName.trim()) return;
    onUpdateFolder(activeFolder.id, { name: editName.trim(), icon: editIcon });
    setShowEditFolderModal(false);
  };

  const triggerDownload = (json: string, filename: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPlaylist = () => {
    const json = onExportPlaylist(selectedFolderId);
    const slug = queueTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '');
    triggerDownload(json, `rfa-lista-${slug || 'escena'}.json`);
    showNotice(true, `Lista "${queueTitle}" exportada`);
  };

  const handleDownloadBackup = () => {
    const json = onExportBackup();
    triggerDownload(json, `rfa-biblioteca-${new Date().toISOString().slice(0, 10)}.json`);
    showNotice(true, 'Biblioteca completa exportada');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = onImportListOrBackup(String(reader.result || ''));
      showNotice(res.ok, res.message);
      if (res.ok) {
        setShowFolderOptions(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Horizontal folder switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => onSelectFolder('all')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition whitespace-nowrap shrink-0 border ${
            selectedFolderId === 'all'
              ? 'bg-accent text-accent-contrast border-accent font-semibold'
              : 'bg-surface text-[#D6D2C8] border-white/8 hover:bg-elevated'
          }`}
        >
          <Music2 className="w-4 h-4" />
          <span>Todas</span>
        </button>

        {folders.map((folder) => {
          const active = selectedFolderId === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelectFolder(folder.id)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition whitespace-nowrap shrink-0 border ${
                active
                  ? 'bg-accent text-accent-contrast border-accent font-semibold'
                  : 'bg-surface text-[#D6D2C8] border-white/8 hover:bg-elevated'
              }`}
            >
              <FolderIcon name={folder.icon} className="w-4 h-4" />
              <span>{folder.name}</span>
              <span
                className={`text-[11px] tabular-nums ${
                  active ? 'text-accent-contrast/75' : 'text-[#8C887E]'
                }`}
              >
                {folder.trackIds.length}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setShowNewFolderModal(true)}
          className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border border-dashed border-white/20 text-[#C7C2B6] hover:border-accent/60 hover:text-accent-light transition whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Nueva carpeta</span>
        </button>
      </div>

      {/* Folder title & quick actions bar */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="min-w-0 flex items-center gap-2.5">
          {activeFolder && (
            <span className="w-10 h-10 rounded-xl bg-surface border border-white/10 text-accent-light flex items-center justify-center shrink-0">
              <FolderIcon name={activeFolder.icon} className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F2F0EB] truncate">
              {queueTitle}
            </h2>
            <p className="text-xs text-[#9C988E] mt-0.5 tabular-nums">
              {tracks.length} {tracks.length === 1 ? 'pista' : 'pistas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {tracks.length > 0 && (
            <button
              type="button"
              onClick={() => onPlayTrack(tracks[0], tracks, queueTitle)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold inline-flex items-center gap-2 hover:bg-accent-light active:scale-[0.98] transition whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Reproducir</span>
            </button>
          )}

          {activeFolder && (
            <button
              type="button"
              onClick={openEditFolder}
              aria-label="Personalizar icono y nombre de carpeta"
              title="Personalizar carpeta"
              className="min-w-[44px] min-h-[44px] rounded-xl border border-white/10 bg-surface text-[#C7C2B6] hover:text-accent-light hover:bg-elevated flex items-center justify-center transition"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowFolderOptions(true)}
            aria-label="Exportar, importar listas y opciones"
            title="Exportar / Importar listas y opciones"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-white/10 bg-surface text-[#C7C2B6] hover:text-[#F2F0EB] hover:bg-elevated flex items-center justify-center transition"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {backupNotice && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs ${
            backupNotice.ok
              ? 'border-accent/40 bg-accent/12 text-accent-light'
              : 'border-rose-500/40 bg-rose-500/12 text-rose-200'
          }`}
        >
          {backupNotice.text}
        </div>
      )}

      {/* Inline filter inside folder */}
      {tracks.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar canciones en esta carpeta..."
            className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-surface border border-white/8 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent/60"
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              aria-label="Limpiar filtro"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#9C988E]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Track List */}
      {filteredTracks.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-surface p-6 text-center space-y-3">
          <p className="text-sm text-[#C7C2B6]">
            {tracks.length === 0
              ? 'Esta carpeta está vacía. Añade pistas desde el buscador, pega un enlace de YouTube o importa una lista.'
              : 'Ninguna canción coincide con tu filtro.'}
          </p>
          {tracks.length === 0 && (
            <button
              type="button"
              onClick={onGoToSearch}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:bg-accent-light transition"
            >
              Buscar canciones
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-surface divide-y divide-white/6 overflow-hidden">
          {filteredTracks.map((track, idx) => {
            const isCurrent = currentTrack?.id === track.id;
            const folderCount = getFoldersContainingTrack(track.id).length;

            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 px-3 py-2.5 min-h-[64px] transition ${
                  isCurrent ? 'bg-accent/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    isCurrent
                      ? onTogglePlay()
                      : onPlayTrack(track, filteredTracks, queueTitle)
                  }
                  className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border ${
                      isCurrent
                        ? 'bg-accent text-accent-contrast border-accent'
                        : 'bg-elevated text-[#D6D2C8] border-white/8'
                    }`}
                  >
                    {isCurrent && isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm font-medium truncate ${
                        isCurrent ? 'text-accent-light' : 'text-[#F2F0EB]'
                      }`}
                    >
                      {track.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#9C988E] truncate mt-0.5">
                      <span className="truncate">{track.artist}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{sourceLabel(track.source)}</span>
                      {track.duration ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular shrink-0">
                            {formatDuration(track.duration)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </button>

                <div className="flex items-center shrink-0">
                  {activeFolder && !filterText && (
                    <>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => onMoveTrack(activeFolder.id, track.id, 'up')}
                          aria-label="Subir"
                          className="hidden sm:flex min-w-[36px] min-h-[44px] items-center justify-center text-[#8C887E] hover:text-[#F2F0EB]"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                      )}
                      {idx < filteredTracks.length - 1 && (
                        <button
                          type="button"
                          onClick={() => onMoveTrack(activeFolder.id, track.id, 'down')}
                          aria-label="Bajar"
                          className="hidden sm:flex min-w-[36px] min-h-[44px] items-center justify-center text-[#8C887E] hover:text-[#F2F0EB]"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenFolderPicker(track)}
                    aria-label="Modificar carpetas de esta canción"
                    title="Modificar carpetas (múltiples carpetas)"
                    className={`min-w-[44px] min-h-[44px] px-2 flex items-center justify-center gap-1 rounded-xl transition ${
                      folderCount > 1
                        ? 'text-accent-light bg-accent/12 hover:bg-accent/20'
                        : 'text-[#9C988E] hover:text-accent-light hover:bg-white/5'
                    }`}
                  >
                    <FolderCheck className="w-4 h-4" />
                    {folderCount > 0 && (
                      <span className="text-[11px] font-mono-tabular">{folderCount}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onRemoveTrackFromFolder(
                        track.id,
                        activeFolder ? activeFolder.id : 'all'
                      )
                    }
                    aria-label={
                      activeFolder
                        ? `Quitar de ${activeFolder.name}`
                        : 'Eliminar canción de la biblioteca'
                    }
                    title={
                      activeFolder
                        ? `Quitar de ${activeFolder.name}`
                        : 'Eliminar de toda la biblioteca'
                    }
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#9C988E] hover:text-rose-400 hover:bg-white/5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Folder Modal */}
      {showNewFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowNewFolderModal(false)}
        >
          <form
            onSubmit={handleCreateSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-white/10 bg-surface p-5 pb-safe space-y-4 shadow-2xl max-h-[88dvh] flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-display text-lg font-semibold text-[#F2F0EB]">
                Nueva carpeta
              </h3>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                aria-label="Cerrar"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9C988E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="shrink-0">
              <label className="block text-xs text-[#9C988E] mb-1.5">
                Nombre de la escena o carpeta
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Jefe final, Bosque encantado, Ciudad"
                autoFocus
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-canvas border border-white/15 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-accent"
              />
            </div>

            <FolderIconGallery value={newIcon} onChange={setNewIcon} />

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-light transition shrink-0"
            >
              Crear carpeta
            </button>
          </form>
        </div>
      )}

      {/* Edit Folder Modal (Name + Icon) */}
      {showEditFolderModal && activeFolder && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowEditFolderModal(false)}
        >
          <form
            onSubmit={handleEditSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-white/10 bg-surface p-5 pb-safe space-y-4 shadow-2xl max-h-[88dvh] flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-display text-lg font-semibold text-[#F2F0EB]">
                Personalizar carpeta
              </h3>
              <button
                type="button"
                onClick={() => setShowEditFolderModal(false)}
                aria-label="Cerrar"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9C988E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="shrink-0 flex items-center gap-2.5">
              <span className="w-11 h-11 rounded-xl bg-canvas border border-accent/40 text-accent-light flex items-center justify-center shrink-0">
                <FolderIcon name={editIcon} className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-[#9C988E] mb-1">
                  Nombre de la carpeta
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-canvas border border-white/15 text-sm text-[#F2F0EB] focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <FolderIconGallery value={editIcon} onChange={setEditIcon} />

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-light transition shrink-0"
            >
              Guardar cambios
            </button>
          </form>
        </div>
      )}

      {/* Lists Export/Import & Folder Options Modal */}
      {showFolderOptions && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowFolderOptions(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 bg-surface p-5 pb-safe space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[#F2F0EB]">
                Listas y opciones
              </h3>
              <button
                type="button"
                onClick={() => setShowFolderOptions(false)}
                aria-label="Cerrar"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9C988E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeFolder && (
              <div className="space-y-2 pb-2 border-b border-white/8">
                <button
                  type="button"
                  onClick={() => {
                    setShowFolderOptions(false);
                    openEditFolder();
                  }}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-elevated text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-white/10"
                >
                  <Pencil className="w-4 h-4 text-accent" />
                  <span>Personalizar icono y nombre</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteFolder(activeFolder.id);
                    setShowFolderOptions(false);
                  }}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-elevated text-sm text-rose-400 flex items-center gap-3 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar "{activeFolder.name}"</span>
                </button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs text-[#9C988E]">Exportar e importar listas (.json)</p>

              <button
                type="button"
                onClick={handleDownloadPlaylist}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-elevated text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-white/10"
              >
                <Share2 className="w-4 h-4 text-accent" />
                <span>Exportar lista "{queueTitle}"</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-elevated text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-white/10"
              >
                <Upload className="w-4 h-4 text-accent" />
                <span>Importar lista o copia de seguridad</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileImport}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleDownloadBackup}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-elevated text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-white/10"
              >
                <Download className="w-4 h-4 text-accent" />
                <span>Exportar todas las listas (copia completa)</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/8">
              <button
                type="button"
                onClick={() => {
                  onResetStarter();
                  setShowFolderOptions(false);
                }}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-elevated text-sm text-[#C7C2B6] flex items-center gap-3 hover:bg-white/10"
              >
                <RotateCcw className="w-4 h-4 text-[#9C988E]" />
                <span>Restaurar carpetas iniciales</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
