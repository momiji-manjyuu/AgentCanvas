import { useEffect, useState } from "react";
import { en } from "./en";
import { ja } from "./ja";
import { getAgentCanvasApi, type AppLocale } from "../lib/electron-api";

export type Locale = AppLocale;
type MessageKey = keyof typeof en;
type Dictionary = Record<MessageKey, string>;
type Params = Record<string, string | number>;

const dictionaries: Record<Locale, Dictionary> = { en, ja };
const listeners = new Set<() => void>();
let currentLocale: Locale = localeFromNavigator();

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

export async function initializeLocale(): Promise<void> {
  try {
    const settings = await getAgentCanvasApi().getSettings();
    applyLocale(settings.locale ?? localeFromNavigator());
  } catch {
    applyLocale(localeFromNavigator());
  }
}

export async function setLocale(locale: Locale): Promise<void> {
  applyLocale(locale);
  await getAgentCanvasApi().setLocale(locale);
}

function applyLocale(locale: Locale): void {
  currentLocale = locale;
  for (const listener of listeners) {
    listener();
  }
}

export function useI18n(): {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
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

function localeFromNavigator(): Locale {
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}
