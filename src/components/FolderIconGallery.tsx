import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { FolderIconName } from '../types/audio';
import {
  FOLDER_ICON_CATEGORIES,
  FOLDER_ICON_OPTIONS,
  FolderIcon,
  FolderIconCategory,
} from './FolderIcon';

interface FolderIconGalleryProps {
  value: FolderIconName;
  onChange: (icon: FolderIconName) => void;
  compact?: boolean;
}

export const FolderIconGallery: React.FC<FolderIconGalleryProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const [category, setCategory] = useState<FolderIconCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(
    () => FOLDER_ICON_OPTIONS.find((opt) => opt.value === value) || FOLDER_ICON_OPTIONS[0],
    [value]
  );

  const filteredIcons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOLDER_ICON_OPTIONS.filter((opt) => {
      if (category !== 'all' && opt.category !== category) return false;
      if (!q) return true;
      return (
        opt.label.toLowerCase().includes(q) ||
        opt.keywords.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  return (
    <div className="min-h-0 flex-1 flex flex-col gap-2.5">
      {/* Header row with current selection + search */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#C7C2B6] min-w-0">
          <span className="w-7 h-7 rounded-lg bg-[#D99B38]/15 border border-[#D99B38]/40 text-[#F2BE63] flex items-center justify-center shrink-0">
            <FolderIcon name={value} className="w-4 h-4" />
          </span>
          <span className="truncate">
            Icono: <strong className="text-[#F2F0EB] font-medium">{selectedOption.label}</strong>
          </span>
        </div>
        <span className="text-[11px] text-[#8C887E] tabular-nums shrink-0">
          {filteredIcons.length} de {FOLDER_ICON_OPTIONS.length}
        </span>
      </div>

      {/* Quick search */}
      <div className="relative shrink-0">
        <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar icono (desierto, iglesia, monstruo, bosque...)"
          className="w-full min-h-[40px] pl-8.5 pr-8 rounded-xl bg-[#0D0E11] border border-white/10 text-xs text-[#F2F0EB] placeholder:text-[#78746C] focus:outline-none focus:border-[#D99B38]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpiar búsqueda de iconos"
            className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-[#9C988E]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
        {FOLDER_ICON_CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 border transition ${
                active
                  ? 'bg-[#D99B38] text-[#0D0E11] border-[#D99B38] font-semibold'
                  : 'bg-[#0D0E11] text-[#B8B3A8] border-white/8 hover:border-white/20 hover:text-[#F2F0EB]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div
        className={`grid grid-cols-4 sm:grid-cols-5 gap-2 overflow-y-auto pr-1 ${
          compact ? 'max-h-[180px]' : 'min-h-[160px] flex-1'
        }`}
      >
        {filteredIcons.length === 0 ? (
          <div className="col-span-full py-6 text-center text-xs text-[#8C887E]">
            No hay iconos que coincidan con "{query}".
          </div>
        ) : (
          filteredIcons.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                title={opt.label}
                className={`min-h-[58px] px-1.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition ${
                  selected
                    ? 'border-[#D99B38] bg-[#D99B38]/15 text-[#F2BE63] shadow-[0_0_0_1px_rgba(217,155,56,0.3)]'
                    : 'border-white/8 bg-[#1E2128]/60 text-[#C7C2B6] hover:bg-[#1E2128] hover:border-white/15'
                }`}
              >
                <FolderIcon name={opt.value} className="w-5 h-5" />
                <span className="text-[10px] leading-tight truncate max-w-full">
                  {opt.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
