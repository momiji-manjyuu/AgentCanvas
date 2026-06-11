import { useEffect, useState } from "react";
import { en } from "./en";
import { ja } from "./ja";

type Locale = "en" | "ja";
type MessageKey = keyof typeof en;
type Dictionary = Record<MessageKey, string>;
type Params = Record<string, string | number>;

const dictionaries: Record<Locale, Dictionary> = { en, ja };
const listeners = new Set<() => void>();
let currentLocale: Locale = initialLocale();

export function t(key: MessageKey, params: Params = {}): string {
  const template: string = dictionaries[currentLocale][key] ?? dictionaries.en[key] ?? key;
  return Object.entries(params).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  window.localStorage.setItem("agentcanvas.locale", locale);
  for (const listener of listeners) {
    listener();
  }
}

export function useI18n(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof t;
} {
  const [locale, setLocaleState] = useState(currentLocale);
  useEffect(() => {
    const listener = () => setLocaleState(currentLocale);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { locale, setLocale, t };
}

function initialLocale(): Locale {
  const saved = window.localStorage.getItem("agentcanvas.locale");
  if (saved === "en" || saved === "ja") {
    return saved;
  }
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}
