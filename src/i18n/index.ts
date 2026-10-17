import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Russian is the source language: translation keys ARE the Russian strings
// (gettext style), so the UI is Russian without a `ru` resource file. Another
// locale is added as a file mapping Russian keys → translations (ADR-002).
void i18n.use(initReactI18next).init({
  lng: 'ru',
  fallbackLng: false,
  resources: { ru: { translation: {} } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
})

export default i18n

/** Translate outside React components (toasts in api/stores, helpers). */
export const t = i18n.t.bind(i18n)

/** Interface languages that have translations. A new one is added here with its resource file. */
export const LANGUAGES: { code: 'ru' | 'en'; label: string }[] = [{ code: 'ru', label: 'Русский' }]
