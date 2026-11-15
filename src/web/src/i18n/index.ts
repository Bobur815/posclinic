import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uz from './uz.json';
import ru from './ru.json';

/** The web dashboard's own locale files; the till keeps its own under src/renderer. */
export const LANGUAGES = ['uz', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'posclinic-web-language';

function savedLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'ru' || v === 'uz' ? v : 'uz';
  } catch {
    return 'uz';
  }
}

i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru } },
  lng: savedLanguage(),
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;

export function setLanguage(lang: Language) {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode: the choice lasts for this tab only */
  }
}

export default i18n;
