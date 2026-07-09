import { ui, defaultLang, languages } from './ui';

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in ui) return lang as keyof typeof ui;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof typeof ui[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  }
}

export function getAlternateUrl(currentUrl: URL, targetLang: string) {
  const [, lang, ...rest] = currentUrl.pathname.split('/');
  const isCurrentLang = lang in ui;
  
  const pathWithoutLang = isCurrentLang ? rest.join('/') : [lang, ...rest].join('/');
  
  if (targetLang === defaultLang) {
    return `/${pathWithoutLang}`;
  }
  
  return `/${targetLang}/${pathWithoutLang}`;
}
