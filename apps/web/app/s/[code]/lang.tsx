'use client';

import { createContext, useContext } from 'react';
import type { SessionField } from '@vff/shared';
import { fieldLabelFor, serverText, translate, type Lang, type TextKey } from '@/lib/i18n';

/** The phone page's language (English / Tamil), chosen with the switch at the top. */
export const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

/** Screen text, field labels and server messages in the chosen language. */
export function useI18n() {
  const { lang } = useContext(LangCtx);
  return {
    lang,
    t: (key: TextKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    label: (f: SessionField) => fieldLabelFor(lang, f),
    srv: (text: string | null | undefined) => serverText(lang, text),
  };
}

export type T = ReturnType<typeof useI18n>['t'];
