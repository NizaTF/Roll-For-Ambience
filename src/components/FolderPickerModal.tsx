import React, { useState } from 'react';
import { Check, FolderPlus, X } from 'lucide-react';
import { Folder, FolderIconName, Track } from '../types/audio';
import { FOLDER_ICON_OPTIONS, FolderIcon } from './FolderIcon';

interface FolderPickerModalProps {
  track: Track | null;
  folders: Folder[];
  containingFolderIds: string[];
  onClose: () => void;
  onAddTrackToFolder: (track: Track, folderId: string) => void;
  onRemoveTrackFromFolder: (trackId: string, folderId: string) => void;
  onCreateFolder: (name: string, icon: FolderIconName) => Folder | null;
}

export const FolderPickerModal: React.FC<FolderPickerModalProps> = ({
  track,
  folders,
  containingFolderIds,
  onClose,
  onAddTrackToFolder,
  onRemoveTrackFromFolder,
  onCreateFolder,
}) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState<FolderIconName>('music');
  const [creating, setCreating] = useState(false);

  if (!track) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = onCreateFolder(newFolderName.trim(), newFolderIcon);
    if (created) {
      onAddTrackToFolder(track, created.id);
      setNewFolderName('');
      setNewFolderIcon('music');
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#16181D] p-5 pb-safe shadow-2xl max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#9C988E]">
              Carpetas de la canción · puedes marcar varias a la vez ({containingFolderIds.length})
            </p>
            <h3 className="font-display text-lg font-semibold text-[#F2F0EB] truncate">
              {track.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#9C988E] hover:text-[#F2F0EB] hover:bg-white/5 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-1.5 overflow-y-auto flex-1 pr-1">
          {folders.map((folder) => {
            const isIn = containingFolderIds.includes(folder.id);
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() =>
                  isIn
                    ? onRemoveTrackFromFolder(track.id, folder.id)
                    : onAddTrackToFolder(track, folder.id)
                }
                className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition text-left ${
                  isIn
                    ? 'border-[#D99B38]/60 bg-[#D99B38]/10 text-[#F2F0EB]'
                    : 'border-white/8 bg-[#1E2128]/60 text-[#D6D2C8] hover:bg-[#1E2128]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isIn ? 'bg-[#D99B38] text-[#0D0E11]' : 'bg-white/5 text-[#9C988E]'
                    }`}
                  >
                    <FolderIcon name={folder.icon} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{folder.name}</div>
                    <div className="text-xs text-[#9C988E] tabular-nums">
                      {folder.trackIds.length} canciones
                    </div>
                  </div>
                </div>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    isIn ? 'bg-[#D99B38] text-[#0D0E11]' : 'border border-white/20 text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>

        {creating ? (
          <form onSubmit={handleCreate} className="mt-3 space-y-2.5 pt-2 border-t border-white/8">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nombre de la nueva carpeta"
                autoFocus
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0D0E11] border border-white/15 text-sm text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-xl bg-[#D99B38] text-[#0D0E11] text-sm font-semibold hover:bg-[#F2BE63] shrink-0"
              >
                Crear
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {FOLDER_ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewFolderIcon(opt.value)}
                  title={opt.label}
                  className={`min-w-[40px] min-h-[40px] rounded-lg border flex items-center justify-center shrink-0 transition ${
                    newFolderIcon === opt.value
                      ? 'border-[#D99B38] bg-[#D99B38]/20 text-[#F2BE63]'
                      : 'border-white/8 bg-[#0D0E11] text-[#9C988E]'
                  }`}
                >
                  <FolderIcon name={opt.value} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 w-full min-h-[44px] rounded-xl border border-dashed border-white/20 text-sm font-medium text-[#D6D2C8] hover:border-[#D99B38]/60 hover:text-[#F2BE63] flex items-center justify-center gap-2 transition"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Nueva carpeta</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full min-h-[46px] rounded-xl bg-[#1E2128] text-sm font-semibold text-[#F2F0EB] hover:bg-[#262A33] transition"
        >
          Listo
        </button>
      </div>
    </div>
  );
};
