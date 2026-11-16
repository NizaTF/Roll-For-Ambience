import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  FolderPlus,
  MoreVertical,
  Music2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatDuration } from '../services/freeMusicApi';
import { Folder, FolderIconName, Track } from '../types/audio';
import { FOLDER_ICON_OPTIONS, FolderIcon } from './FolderIcon';

interface LibraryViewProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  activeFolder: Folder | null;
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track, queue: Track[], queueName: string) => void;
  onTogglePlay: () => void;
  onCreateFolder: (name: string, icon: FolderIconName) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onOpenFolderPicker: (track: Track) => void;
  onRemoveTrackFromFolder: (trackId: string, folderId: string) => void;
  onMoveTrack: (folderId: string, trackId: string, dir: 'up' | 'down') => void;
  onExportBackup: () => string;
  onImportBackup: (json: string) => boolean;
  onResetStarter: () => void;
  onGoToSearch: () => void;
}

function sourceLabel(source: Track['source']): string {
  switch (source) {
    case 'youtube':
      return 'YouTube';
    case 'audius':
      return 'Audius';
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
  onPlayTrack,
  onTogglePlay,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenFolderPicker,
  onRemoveTrackFromFolder,
  onMoveTrack,
  onExportBackup,
  onImportBackup,
  onResetStarter,
  onGoToSearch,
}) => {
  const [filterText, setFilterText] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<FolderIconName>('sword');

  const [showFolderOptions, setShowFolderOptions] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
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

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateFolder(newName.trim(), newIcon);
    setNewName('');
    setNewIcon('sword');
    setShowNewFolderModal(false);
  };

  const handleDownloadBackup = () => {
    const json = onExportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rfa-carpetas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupNotice('Copia de seguridad descargada');
    setTimeout(() => setBackupNotice(null), 2500);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = onImportBackup(String(reader.result || ''));
      setBackupNotice(ok ? 'Biblioteca restaurada' : 'Archivo no válido');
      setTimeout(() => setBackupNotice(null), 2500);
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
              ? 'bg-[#D99B38] text-[#0D0E11] border-[#D99B38] font-semibold'
              : 'bg-[#16181D] text-[#D6D2C8] border-white/8 hover:bg-[#1E2128]'
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
                  ? 'bg-[#D99B38] text-[#0D0E11] border-[#D99B38] font-semibold'
                  : 'bg-[#16181D] text-[#D6D2C8] border-white/8 hover:bg-[#1E2128]'
              }`}
            >
              <FolderIcon name={folder.icon} className="w-4 h-4" />
              <span>{folder.name}</span>
              <span
                className={`text-[11px] tabular-nums ${
                  active ? 'text-[#0D0E11]/75' : 'text-[#8C887E]'
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
          className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border border-dashed border-white/20 text-[#C7C2B6] hover:border-[#D99B38]/60 hover:text-[#F2BE63] transition whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Nueva carpeta</span>
        </button>
      </div>

      {/* Folder title & quick play bar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F2F0EB] truncate">
            {queueTitle}
          </h2>
          <p className="text-xs text-[#9C988E] mt-0.5 tabular-nums">
            {tracks.length} {tracks.length === 1 ? 'pista' : 'pistas'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tracks.length > 0 && (
            <button
              type="button"
              onClick={() => onPlayTrack(tracks[0], tracks, queueTitle)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D99B38] text-[#0D0E11] text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#F2BE63] active:scale-[0.98] transition whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Reproducir</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowFolderOptions(true);
              setRenaming(false);
              setRenameText(activeFolder?.name || '');
            }}
            aria-label="Opciones de carpeta y copia de seguridad"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-white/10 bg-[#16181D] text-[#C7C2B6] hover:bg-[#1E2128] flex items-center justify-center transition"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline filter inside folder */}
      {tracks.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C887E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar canciones en esta carpeta..."
            className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-[#16181D] border border-white/8 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]/60"
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
        <div className="rounded-2xl border border-white/8 bg-[#16181D] p-6 text-center space-y-3">
          <p className="text-sm text-[#C7C2B6]">
            {tracks.length === 0
              ? 'Esta carpeta está vacía. Añade pistas desde el buscador o pega un enlace de YouTube.'
              : 'Ninguna canción coincide con tu filtro.'}
          </p>
          {tracks.length === 0 && (
            <button
              type="button"
              onClick={onGoToSearch}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D99B38] text-[#0D0E11] text-xs font-semibold hover:bg-[#F2BE63] transition"
            >
              Buscar canciones
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-[#16181D] divide-y divide-white/6 overflow-hidden">
          {filteredTracks.map((track, idx) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-3 py-2.5 min-h-[64px] transition ${
                  isCurrent ? 'bg-[#D99B38]/10' : 'hover:bg-white/[0.03]'
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
                        ? 'bg-[#D99B38] text-[#0D0E11] border-[#D99B38]'
                        : 'bg-[#1E2128] text-[#D6D2C8] border-white/8'
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
                        isCurrent ? 'text-[#F2BE63]' : 'text-[#F2F0EB]'
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
                          className="hidden sm:flex min-w-[38px] min-h-[44px] items-center justify-center text-[#8C887E] hover:text-[#F2F0EB]"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                      )}
                      {idx < filteredTracks.length - 1 && (
                        <button
                          type="button"
                          onClick={() => onMoveTrack(activeFolder.id, track.id, 'down')}
                          aria-label="Bajar"
                          className="hidden sm:flex min-w-[38px] min-h-[44px] items-center justify-center text-[#8C887E] hover:text-[#F2F0EB]"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenFolderPicker(track)}
                    aria-label="Guardar en carpetas"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#9C988E] hover:text-[#F2BE63] hover:bg-white/5"
                  >
                    <FolderPlus className="w-4 h-4" />
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
                      activeFolder ? 'Quitar de esta carpeta' : 'Eliminar canción'
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
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#16181D] p-5 pb-safe space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
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

            <div>
              <label className="block text-xs text-[#9C988E] mb-1.5">
                Nombre de la escena o carpeta
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Jefe final, Bosque encantado, Ciudad"
                autoFocus
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#0D0E11] border border-white/15 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
              />
            </div>

            <div>
              <span className="block text-xs text-[#9C988E] mb-2">Icono</span>
              <div className="grid grid-cols-4 gap-2">
                {FOLDER_ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewIcon(opt.value)}
                    className={`min-h-[44px] px-2 py-2 rounded-xl border text-xs flex flex-col items-center justify-center gap-1 transition ${
                      newIcon === opt.value
                        ? 'border-[#D99B38] bg-[#D99B38]/15 text-[#F2BE63]'
                        : 'border-white/8 bg-[#1E2128]/60 text-[#C7C2B6]'
                    }`}
                  >
                    <FolderIcon name={opt.value} className="w-4 h-4" />
                    <span className="text-[11px]">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-[#D99B38] text-[#0D0E11] text-sm font-semibold hover:bg-[#F2BE63] transition"
            >
              Crear carpeta
            </button>
          </form>
        </div>
      )}

      {/* Folder Options & Backup Modal */}
      {showFolderOptions && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowFolderOptions(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#16181D] p-5 pb-safe space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[#F2F0EB]">
                Opciones de biblioteca
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
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#0D0E11] border border-white/15 text-sm text-[#F2F0EB]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onRenameFolder(activeFolder.id, renameText);
                        setRenaming(false);
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-[#D99B38] text-[#0D0E11] text-xs font-semibold"
                    >
                      Guardar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameText(activeFolder.name);
                      setRenaming(true);
                    }}
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#1E2128] text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-[#262A33]"
                  >
                    <Pencil className="w-4 h-4 text-[#D99B38]" />
                    <span>Renombrar "{activeFolder.name}"</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onDeleteFolder(activeFolder.id);
                    setShowFolderOptions(false);
                  }}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#1E2128] text-sm text-rose-400 flex items-center gap-3 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar carpeta</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadBackup}
              className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#1E2128] text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-[#262A33]"
            >
              <Download className="w-4 h-4 text-[#D99B38]" />
              <span>Exportar copia de seguridad (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#1E2128] text-sm text-[#F2F0EB] flex items-center gap-3 hover:bg-[#262A33]"
            >
              <Upload className="w-4 h-4 text-[#D99B38]" />
              <span>Importar copia de seguridad</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileImport}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => {
                onResetStarter();
                setShowFolderOptions(false);
              }}
              className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#1E2128] text-sm text-[#C7C2B6] flex items-center gap-3 hover:bg-[#262A33]"
            >
              <RotateCcw className="w-4 h-4 text-[#9C988E]" />
              <span>Restaurar carpetas iniciales</span>
            </button>

            {backupNotice && (
              <p className="text-xs text-[#F2BE63] text-center pt-1">{backupNotice}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
