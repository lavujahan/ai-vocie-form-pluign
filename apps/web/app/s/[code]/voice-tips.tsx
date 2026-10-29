'use client';

import { useEffect } from 'react';
import { TIPS_TEXT } from '@vff/shared';
import { TipsDeck } from '@vff/shared/ui/voice-tips';
import { useI18n } from './lang';

/** Set once the voice tips were opened (or their callout closed) on this phone: the bubble stops calling out. */
export const TIPS_SEEN_KEY = 'vf-voice-tips-seen';

/** The voice tips in a bottom sheet over the form, in the page's language. */
export function TipsSheet({ onClose }: { onClose: () => void }) {
  const { lang } = useI18n();
  useEffect(() => {
    // The page behind stays put while the sheet is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={TIPS_TEXT[lang].title}>
      <button type="button" aria-label={TIPS_TEXT[lang].close} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-auto flex h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl shadow-[0_-12px_32px_rgba(0,0,0,0.22)] motion-safe:animate-[sheet-up_160ms_ease-out]">
        <div className="min-h-0 flex-1 bg-card pb-[env(safe-area-inset-bottom,0px)]">
          <TipsDeck lang={lang} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
