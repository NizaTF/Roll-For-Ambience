import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:bg-accent-light active:scale-[0.98] transition whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4" />
        <span>Instalar app</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border border-white/10 bg-surface text-[#D6D2C8] text-xs font-medium hover:bg-elevated active:scale-[0.98] transition whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-4 h-4 text-accent" />
        <span>Instalar</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-[#F2F0EB]">
                Instalar en tu dispositivo
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Cerrar"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#9C988E] hover:text-[#F2F0EB] hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {isIOS ? (
              <ol className="mt-3 space-y-2 text-sm text-[#C7C2B6] leading-relaxed">
                <li>1. Pulsa el botón <strong>Compartir</strong> en la barra de Safari.</li>
                <li>2. Desliza y selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-sm text-[#C7C2B6] leading-relaxed">
                <li>1. Abre el menú de Chrome en Android (tres puntos arriba a la derecha).</li>
                <li>2. Pulsa <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar aplicación</strong>.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-light transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
