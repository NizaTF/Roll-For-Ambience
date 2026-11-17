import React, { useEffect, useState } from 'react';
import {
  Check,
  HardDrive,
  Palette,
  RotateCcw,
  Sliders,
  Type,
  Zap,
} from 'lucide-react';
import {
  APP_ACCENT_PRESETS,
  APP_BG_PRESETS,
  APP_FONT_PRESETS,
  resolvePalette,
} from '../services/appearance';
import { formatBytes, getLocalMediaStats } from '../services/localMedia';
import {
  AppAppearanceSettings,
  AppCardRadius,
  AppTextScale,
} from '../types/audio';

interface SettingsViewProps {
  settings: AppAppearanceSettings;
  onUpdate: (patch: Partial<AppAppearanceSettings>) => void;
  onReset: () => void;
}

const TEXT_SCALE_OPTIONS: { id: AppTextScale; label: string; hint: string }[] = [
  { id: 'compact', label: 'Compacto', hint: 'Más contenido visible' },
  { id: 'normal', label: 'Normal', hint: 'Equilibrio estándar' },
  { id: 'large', label: 'Grande', hint: 'Ideal para mesa' },
];

const CARD_RADIUS_OPTIONS: { id: AppCardRadius; label: string }[] = [
  { id: 'sharp', label: 'Angular' },
  { id: 'balanced', label: 'Equilibrado' },
  { id: 'soft', label: 'Suave' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdate,
  onReset,
}) => {
  const palette = resolvePalette(settings);
  const [localStats, setLocalStats] = useState<{
    count: number;
    totalBytes: number;
    musicCount: number;
    sfxCount: number;
  }>({ count: 0, totalBytes: 0, musicCount: 0, sfxCount: 0 });

  useEffect(() => {
    let mounted = true;
    getLocalMediaStats().then((stats) => {
      if (mounted) setLocalStats(stats);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F2F0EB]">
            Configuración
          </h2>
          <p className="text-xs text-[#9C988E] mt-0.5">
            Personaliza la fuente, el fondo, el color de selección y el rendimiento
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-surface text-xs font-medium text-[#C7C2B6] hover:text-accent-light hover:border-accent/50 inline-flex items-center gap-1.5 transition shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar tema</span>
        </button>
      </div>

      {/* Live Preview Strip */}
      <div className="rounded-2xl border border-white/10 bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[#9C988E]">Vista previa en vivo</span>
          <span className="text-[11px] font-mono-tabular text-accent-light">
            {palette.fontPreset.label}
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-canvas p-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-display text-base font-semibold text-[#F2F0EB] truncate">
              Taberna del Dragón Dorado
            </div>
            <div className="text-xs text-[#9C988E] truncate">
              Texto de ejemplo · <span className="text-accent-light">elemento seleccionado</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1.5 rounded-lg bg-accent text-accent-contrast text-xs font-semibold">
              Activo
            </span>
            <span className="px-3 py-1.5 rounded-lg border border-accent/50 bg-accent/15 text-accent-light text-xs font-medium">
              En bucle
            </span>
          </div>
        </div>
      </div>

      {/* Section 1: Font & Text Size */}
      <section className="rounded-2xl border border-white/10 bg-surface p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F0EB]">
          <Type className="w-4 h-4 text-accent" />
          <span>Tipografía y tamaño de letra</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {APP_FONT_PRESETS.map((preset) => {
            const selected = settings.fontId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdate({ fontId: preset.id })}
                className={`min-h-[64px] px-3.5 py-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                  selected
                    ? 'border-accent bg-accent/15 text-[#F2F0EB]'
                    : 'border-white/10 bg-canvas/70 text-[#D6D2C8] hover:border-white/20'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ fontFamily: preset.display }}
                  >
                    {preset.label}
                  </div>
                  <div
                    className="text-xs text-[#9C988E] truncate mt-0.5"
                    style={{ fontFamily: preset.sans }}
                  >
                    {preset.sample}
                  </div>
                </div>
                {selected && (
                  <span className="w-6 h-6 rounded-full bg-accent text-accent-contrast flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="text-xs text-[#9C988E]">Tamaño general del texto</div>
          <div className="grid grid-cols-3 gap-2">
            {TEXT_SCALE_OPTIONS.map((opt) => {
              const active = settings.textScale === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdate({ textScale: opt.id })}
                  className={`min-h-[48px] px-2.5 py-2 rounded-xl border text-center transition ${
                    active
                      ? 'border-accent bg-accent text-accent-contrast font-semibold'
                      : 'border-white/10 bg-canvas/70 text-[#C7C2B6] hover:text-[#F2F0EB]'
                  }`}
                >
                  <div className="text-xs">{opt.label}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      active ? 'opacity-80' : 'text-[#8C887E]'
                    }`}
                  >
                    {opt.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 2: Background Color */}
      <section className="rounded-2xl border border-white/10 bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F0EB]">
            <Palette className="w-4 h-4 text-accent" />
            <span>Fondo de la aplicación</span>
          </div>
          <span className="text-[11px] font-mono-tabular text-[#9C988E]">
            {palette.bg}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {APP_BG_PRESETS.map((preset) => {
            const selected = settings.bgPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdate({ bgPreset: preset.id })}
                className={`min-h-[54px] px-3 py-2 rounded-xl border flex items-center gap-2.5 text-left transition ${
                  selected
                    ? 'border-accent bg-accent/15 text-[#F2F0EB]'
                    : 'border-white/10 bg-canvas/60 text-[#D6D2C8] hover:border-white/20'
                }`}
              >
                <span
                  className="w-7 h-7 rounded-lg border border-white/20 shrink-0 flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${preset.bg} 55%, ${preset.surface} 100%)`,
                  }}
                >
                  {selected && <Check className="w-3.5 h-3.5 text-accent-light" />}
                </span>
                <span className="text-xs font-medium truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Background Picker */}
        <div className="rounded-xl border border-white/10 bg-canvas/60 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#F2F0EB]">
              Color de fondo personalizado
            </div>
            <div className="text-[11px] text-[#8C887E]">
              Se ajusta a tono oscuro para mantener la legibilidad en partida
            </div>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="color"
              value={settings.customBgColor}
              onChange={(e) =>
                onUpdate({
                  bgPreset: 'custom',
                  customBgColor: e.target.value.toUpperCase(),
                })
              }
              aria-label="Elegir color de fondo personalizado"
              className="w-10 h-9 rounded-lg border border-white/20 bg-transparent cursor-pointer"
            />
            <span
              className={`text-xs font-mono-tabular px-2 py-1 rounded-lg border ${
                settings.bgPreset === 'custom'
                  ? 'border-accent text-accent-light bg-accent/12'
                  : 'border-white/10 text-[#9C988E]'
              }`}
            >
              {settings.customBgColor}
            </span>
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-canvas/40 px-3 py-2.5 cursor-pointer">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#F2F0EB]">
              Brillo ambiental en el fondo
            </div>
            <div className="text-[11px] text-[#8C887E]">
              Añade un halo sutil arriba usando el color de selección
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.bgAtmosphere}
            onChange={(e) => onUpdate({ bgAtmosphere: e.target.checked })}
            className="w-4 h-4 accent-accent shrink-0"
          />
        </label>
      </section>

      {/* Section 3: Selection / Accent Color */}
      <section className="rounded-2xl border border-white/10 bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F0EB]">
            <Sliders className="w-4 h-4 text-accent" />
            <span>Color de selección y botones activos</span>
          </div>
          <span className="text-[11px] font-mono-tabular text-accent-light">
            {palette.accent}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {APP_ACCENT_PRESETS.map((preset) => {
            const selected = settings.accentPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdate({ accentPreset: preset.id })}
                className={`min-h-[52px] px-3 py-2 rounded-xl border flex items-center gap-2.5 text-left transition ${
                  selected
                    ? 'border-accent bg-accent/15 text-[#F2F0EB]'
                    : 'border-white/10 bg-canvas/60 text-[#D6D2C8] hover:border-white/20'
                }`}
              >
                <span
                  className="w-6 h-6 rounded-full shrink-0 border border-white/20 flex items-center justify-center"
                  style={{ backgroundColor: preset.color, color: preset.contrast }}
                >
                  {selected && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className="text-xs font-medium truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Accent Picker */}
        <div className="rounded-xl border border-white/10 bg-canvas/60 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#F2F0EB]">
              Color de selección personalizado
            </div>
            <div className="text-[11px] text-[#8C887E]">
              Cambia botones principales, pestañas, sliders y textos resaltados
            </div>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="color"
              value={settings.customAccentColor}
              onChange={(e) =>
                onUpdate({
                  accentPreset: 'custom',
                  customAccentColor: e.target.value.toUpperCase(),
                })
              }
              aria-label="Elegir color de selección personalizado"
              className="w-10 h-9 rounded-lg border border-white/20 bg-transparent cursor-pointer"
            />
            <span
              className={`text-xs font-mono-tabular px-2 py-1 rounded-lg border ${
                settings.accentPreset === 'custom'
                  ? 'border-accent text-accent-light bg-accent/12'
                  : 'border-white/10 text-[#9C988E]'
              }`}
            >
              {settings.customAccentColor}
            </span>
          </label>
        </div>
      </section>

      {/* Section 4: Card Style & Performance */}
      <section className="rounded-2xl border border-white/10 bg-surface p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F0EB]">
          <Zap className="w-4 h-4 text-accent" />
          <span>Estilo de tarjetas y rendimiento</span>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-[#9C988E]">Bordes de tarjetas y paneles</div>
          <div className="grid grid-cols-3 gap-2">
            {CARD_RADIUS_OPTIONS.map((opt) => {
              const active = settings.cardRadius === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdate({ cardRadius: opt.id })}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium transition ${
                    active
                      ? 'border-accent bg-accent text-accent-contrast font-semibold'
                      : 'border-white/10 bg-canvas/60 text-[#C7C2B6] hover:text-[#F2F0EB]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-canvas/40 px-3 py-2.5 cursor-pointer">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#F2F0EB]">
              Reducir animaciones de interfaz
            </div>
            <div className="text-[11px] text-[#8C887E]">
              Mejora la fluidez y batería en dispositivos Android de gama baja
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(e) => onUpdate({ reduceMotion: e.target.checked })}
            className="w-4 h-4 accent-accent shrink-0"
          />
        </label>
      </section>

      {/* Section 5: Local Audio Storage Summary */}
      <section className="rounded-2xl border border-white/10 bg-surface p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/35 text-accent-light flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#F2F0EB]">
              Audios locales guardados
            </div>
            <div className="text-xs text-[#9C988E] truncate">
              {localStats.count === 0
                ? 'Ningún archivo local importado todavía'
                : `${localStats.musicCount} canciones · ${localStats.sfxCount} sonidos`}
            </div>
          </div>
        </div>
        <span className="text-xs font-mono-tabular text-accent-light shrink-0">
          {formatBytes(localStats.totalBytes)}
        </span>
      </section>
    </div>
  );
};
