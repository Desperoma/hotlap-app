import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getLang, isLang, setLangNow, type Lang } from './core';

export { LANGS, getLang, locale, t, type Lang } from './core';

const SLOT = 'hotlap.lang';

/** Langue du téléphone si elle est proposée, sinon l'anglais. */
export function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return isLang(code) ? code : 'en';
}

type Ctx = { lang: Lang; chosen: boolean; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: 'en', chosen: false, setLang: () => {} });

/**
 * Langue de l'app : choisie à l'inscription ou dans Settings > Language, gardée sur le téléphone
 * (et dans le profil, pour la retrouver sur un autre téléphone). Changer de langue redessine
 * toute l'app (`key` du navigateur racine).
 */
export function LanguageProvider({ children }: { children: (ready: boolean, lang: Lang) => ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; lang: Lang; chosen: boolean }>({ ready: false, lang: getLang(), chosen: false });
  useEffect(() => {
    AsyncStorage.getItem(SLOT).catch(() => null).then((v) => {
      const lang = isLang(v) ? v : deviceLang();
      setLangNow(lang);
      setState({ ready: true, lang, chosen: isLang(v) });
    });
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangNow(l);
    setState((s) => ({ ...s, lang: l, chosen: true }));
    AsyncStorage.setItem(SLOT, l).catch(() => {});
  }, []);
  return <LangContext.Provider value={{ lang: state.lang, chosen: state.chosen, setLang }}>{children(state.ready, state.lang)}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
