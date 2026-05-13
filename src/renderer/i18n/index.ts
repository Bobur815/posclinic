import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';
import uz from './locales/uz.json';

const savedLanguage = localStorage.getItem('language') || 'uz';

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uz: { translation: uz },
  },
  lng: savedLanguage,
  fallbackLng: 'uz',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
