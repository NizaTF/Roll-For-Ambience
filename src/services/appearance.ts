import {
  AppAccentPresetId,
  AppAppearanceSettings,
  AppBgPresetId,
  AppCardRadius,
  AppFontId,
  AppTextScale,
} from '../types/audio';
import { loadLocalStorageJSON, savePersistedJSON } from './persistence';

export const APPEARANCE_STORAGE_KEY = 'rfa_dnd_appearance_v1';

export const DEFAULT_APPEARANCE: AppAppearanceSettings = {
  fontId: 'classic',
  textScale: 'normal',
  bgPreset: 'obsidian',
  customBgColor: '#0D0E11',
  bgAtmosphere: true,
  accentPreset: 'amber',
  customAccentColor: '#D99B38',
  cardRadius: 'balanced',
  reduceMotion: false,
};

export interface FontPresetMeta {
  id: AppFontId;
  label: string;
  description: string;
  sans: string;
  display: string;
  sample: string;
}

export const APP_FONT_PRESETS: FontPresetMeta[] = [
  {
    id: 'classic',
    label: 'Clásica Rol',
    description: 'Editorial elegante y muy legible',
    sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    display: "'Fraunces', Georgia, serif",
    sample: 'Aa · Roll For Ambience',
  },
  {
    id: 'fantasy',
    label: 'Fantasía Épica',
    description: 'Títulos grabados medievales',
    sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    display: "'Cinzel', Georgia, serif",
    sample: 'AA · CRÓNICAS DE CAMPAÑA',
  },
  {
    id: 'chronicle',
    label: 'Crónica Literaria',
    description: 'Tipografía serif cálida de libro',
    sans: "'Lora', Georgia, serif",
    display: "'Lora', Georgia, serif",
    sample: 'Aa · Libro de Aventuras',
  },
  {
    id: 'modern',
    label: 'Moderna Nítida',
    description: 'Limpia y compacta para pantallas pequeñas',
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    display: "'Inter', system-ui, -apple-system, sans-serif",
    sample: 'Aa · Estudio limpio',
  },
  {
    id: 'arcane',
    label: 'Arcana Técnica',
    description: 'Geométrica moderna con toque técnico',
    sans: "'Space Grotesk', system-ui, sans-serif",
    display: "'Space Grotesk', system-ui, sans-serif",
    sample: 'Aa · Consola Arcana',
  },
  {
    id: 'system',
    label: 'Sistema (Rápida)',
    description: 'Fuente nativa del teléfono sin descargas',
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    display: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    sample: 'Aa · Fuente nativa',
  },
];

export interface BgPresetMeta {
  id: Exclude<AppBgPresetId, 'custom'>;
  label: string;
  bg: string;
  surface: string;
  elevated: string;
}

export const APP_BG_PRESETS: BgPresetMeta[] = [
  {
    id: 'obsidian',
    label: 'Obsidiana',
    bg: '#0D0E11',
    surface: '#16181D',
    elevated: '#1E2128',
  },
  {
    id: 'abyss',
    label: 'Noche Abisal',
    bg: '#070B12',
    surface: '#0F1622',
    elevated: '#172132',
  },
  {
    id: 'forest',
    label: 'Bosque Sombrío',
    bg: '#07100B',
    surface: '#0E1B13',
    elevated: '#16271D',
  },
  {
    id: 'crimson',
    label: 'Cripta Carmesí',
    bg: '#12080B',
    surface: '#1C0E13',
    elevated: '#28151C',
  },
  {
    id: 'grimoire',
    label: 'Grimorio Violeta',
    bg: '#0C0914',
    surface: '#161022',
    elevated: '#211932',
  },
  {
    id: 'oled',
    label: 'Negro OLED',
    bg: '#000000',
    surface: '#0C0C0F',
    elevated: '#16161B',
  },
];

export interface AccentPresetMeta {
  id: Exclude<AppAccentPresetId, 'custom'>;
  label: string;
  color: string;
  light: string;
  contrast: string;
}

export const APP_ACCENT_PRESETS: AccentPresetMeta[] = [
  {
    id: 'amber',
    label: 'Ámbar Taberna',
    color: '#D99B38',
    light: '#F2BE63',
    contrast: '#0D0E11',
  },
  {
    id: 'crimson',
    label: 'Fuego Dragón',
    color: '#E05260',
    light: '#FF8591',
    contrast: '#FFFFFF',
  },
  {
    id: 'emerald',
    label: 'Esmeralda',
    color: '#2FB37D',
    light: '#5ED9A6',
    contrast: '#06150E',
  },
  {
    id: 'sapphire',
    label: 'Zafiro Arcano',
    color: '#4B8DF8',
    light: '#84B5FF',
    contrast: '#07101F',
  },
  {
    id: 'violet',
    label: 'Amatista',
    color: '#9D6BFF',
    light: '#C1A1FF',
    contrast: '#FFFFFF',
  },
  {
    id: 'silver',
    label: 'Plata Lunar',
    color: '#CBD5E1',
    light: '#F1F5F9',
    contrast: '#0D0E11',
  },
];

function normalizeHex(hex: string, fallback: string): string {
  const clean = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean.toUpperCase();
  return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = normalizeHex(hex, '#D99B38').slice(1);
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    a.r + (b.r - a.r) * w,
    a.g + (b.g - a.g) * w,
    a.b + (b.b - a.b) * w
  );
}

function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function sanitizeAppearanceSettings(
  raw: Partial<AppAppearanceSettings> | null | undefined
): AppAppearanceSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };

  const validFonts: AppFontId[] = [
    'classic',
    'fantasy',
    'chronicle',
    'modern',
    'arcane',
    'system',
  ];
  const validBgs: AppBgPresetId[] = [
    'obsidian',
    'abyss',
    'forest',
    'crimson',
    'grimoire',
    'oled',
    'custom',
  ];
  const validAccents: AppAccentPresetId[] = [
    'amber',
    'crimson',
    'emerald',
    'sapphire',
    'violet',
    'silver',
    'custom',
  ];
  const validScales: AppTextScale[] = ['compact', 'normal', 'large'];
  const validRadii: AppCardRadius[] = ['sharp', 'balanced', 'soft'];

  return {
    fontId: validFonts.includes(raw.fontId as AppFontId)
      ? (raw.fontId as AppFontId)
      : DEFAULT_APPEARANCE.fontId,
    textScale: validScales.includes(raw.textScale as AppTextScale)
      ? (raw.textScale as AppTextScale)
      : DEFAULT_APPEARANCE.textScale,
    bgPreset: validBgs.includes(raw.bgPreset as AppBgPresetId)
      ? (raw.bgPreset as AppBgPresetId)
      : DEFAULT_APPEARANCE.bgPreset,
    customBgColor: normalizeHex(
      raw.customBgColor || DEFAULT_APPEARANCE.customBgColor,
      DEFAULT_APPEARANCE.customBgColor
    ),
    bgAtmosphere:
      typeof raw.bgAtmosphere === 'boolean'
        ? raw.bgAtmosphere
        : DEFAULT_APPEARANCE.bgAtmosphere,
    accentPreset: validAccents.includes(raw.accentPreset as AppAccentPresetId)
      ? (raw.accentPreset as AppAccentPresetId)
      : DEFAULT_APPEARANCE.accentPreset,
    customAccentColor: normalizeHex(
      raw.customAccentColor || DEFAULT_APPEARANCE.customAccentColor,
      DEFAULT_APPEARANCE.customAccentColor
    ),
    cardRadius: validRadii.includes(raw.cardRadius as AppCardRadius)
      ? (raw.cardRadius as AppCardRadius)
      : DEFAULT_APPEARANCE.cardRadius,
    reduceMotion:
      typeof raw.reduceMotion === 'boolean'
        ? raw.reduceMotion
        : DEFAULT_APPEARANCE.reduceMotion,
  };
}

export function loadInitialAppearance(): AppAppearanceSettings {
  const stored = loadLocalStorageJSON<Partial<AppAppearanceSettings>>(
    APPEARANCE_STORAGE_KEY
  );
  return sanitizeAppearanceSettings(stored);
}

export async function persistAppearance(
  settings: AppAppearanceSettings
): Promise<void> {
  await savePersistedJSON(APPEARANCE_STORAGE_KEY, settings);
}

export function resolvePalette(settings: AppAppearanceSettings) {
  const fontPreset =
    APP_FONT_PRESETS.find((f) => f.id === settings.fontId) || APP_FONT_PRESETS[0];

  let bg = '#0D0E11';
  let surface = '#16181D';
  let elevated = '#1E2128';

  if (settings.bgPreset === 'custom') {
    // Keep custom background dark enough so white/light typography remains crisp
    const rawLum = getRelativeLuminance(settings.customBgColor);
    bg =
      rawLum > 0.16
        ? mixHex(settings.customBgColor, '#0A0B0E', 0.72)
        : settings.customBgColor;
    surface = mixHex(bg, '#FFFFFF', 0.055);
    elevated = mixHex(bg, '#FFFFFF', 0.105);
  } else {
    const preset =
      APP_BG_PRESETS.find((b) => b.id === settings.bgPreset) || APP_BG_PRESETS[0];
    bg = preset.bg;
    surface = preset.surface;
    elevated = preset.elevated;
  }

  let accent = '#D99B38';
  let accentLight = '#F2BE63';
  let accentContrast = '#0D0E11';

  if (settings.accentPreset === 'custom') {
    accent = normalizeHex(settings.customAccentColor, '#D99B38');
    accentLight = mixHex(accent, '#FFFFFF', 0.34);
    accentContrast = getRelativeLuminance(accent) > 0.34 ? '#0D0E11' : '#FFFFFF';
  } else {
    const preset =
      APP_ACCENT_PRESETS.find((a) => a.id === settings.accentPreset) ||
      APP_ACCENT_PRESETS[0];
    accent = preset.color;
    accentLight = preset.light;
    accentContrast = preset.contrast;
  }

  return {
    fontPreset,
    bg,
    surface,
    elevated,
    accent,
    accentLight,
    accentContrast,
  };
}

export function applyAppearanceToDocument(settings: AppAppearanceSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const { fontPreset, bg, surface, elevated, accent, accentLight, accentContrast } =
    resolvePalette(settings);

  root.style.setProperty('--font-sans', fontPreset.sans);
  root.style.setProperty('--font-display', fontPreset.display);
  root.style.setProperty('--rfa-bg', bg);
  root.style.setProperty('--rfa-surface', surface);
  root.style.setProperty('--rfa-elevated', elevated);
  root.style.setProperty('--rfa-accent', accent);
  root.style.setProperty('--rfa-accent-light', accentLight);
  root.style.setProperty('--rfa-accent-contrast', accentContrast);

  const fontSizePx =
    settings.textScale === 'compact'
      ? '14.5px'
      : settings.textScale === 'large'
      ? '17.5px'
      : '16px';
  root.style.fontSize = fontSizePx;

  const radius =
    settings.cardRadius === 'sharp'
      ? '0.625rem'
      : settings.cardRadius === 'soft'
      ? '1.375rem'
      : '1rem';
  root.style.setProperty('--rfa-card-radius', radius);
  root.dataset.cardRadius = settings.cardRadius;

  root.classList.toggle('rfa-atmosphere', settings.bgAtmosphere);
  root.classList.toggle('rfa-reduce-motion', settings.reduceMotion);

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', bg);
  }
}
