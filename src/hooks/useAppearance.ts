import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearanceToDocument,
  DEFAULT_APPEARANCE,
  loadInitialAppearance,
  persistAppearance,
  sanitizeAppearanceSettings,
} from '../services/appearance';
import { loadIndexedDBJSON, loadLocalStorageJSON } from '../services/persistence';
import { AppAppearanceSettings } from '../types/audio';

export function useAppearance() {
  const [settings, setSettings] = useState<AppAppearanceSettings>(loadInitialAppearance);
  const hydratedRef = useRef(false);

  useEffect(() => {
    applyAppearanceToDocument(settings);
  }, [settings]);

  useEffect(() => {
    const hasLocal = Boolean(
      loadLocalStorageJSON<Partial<AppAppearanceSettings>>(APPEARANCE_STORAGE_KEY)
    );
    if (!hasLocal) {
      loadIndexedDBJSON<Partial<AppAppearanceSettings>>(APPEARANCE_STORAGE_KEY).then(
        (idbData) => {
          if (idbData) {
            const clean = sanitizeAppearanceSettings(idbData);
            setSettings(clean);
            applyAppearanceToDocument(clean);
          }
          hydratedRef.current = true;
        }
      );
    } else {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    persistAppearance(settings);
  }, [settings]);

  const updateSettings = useCallback(
    (patch: Partial<AppAppearanceSettings>) => {
      setSettings((prev) => sanitizeAppearanceSettings({ ...prev, ...patch }));
    },
    []
  );

  const resetAppearance = useCallback(() => {
    setSettings({ ...DEFAULT_APPEARANCE });
  }, []);

  return {
    settings,
    updateSettings,
    resetAppearance,
  };
}
