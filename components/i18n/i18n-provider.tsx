"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";

import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/types";

interface I18nContextValue {
  readonly locale: Locale;
  readonly messages: Messages;
  readonly changeLocale: (locale: Locale) => Promise<boolean>;
  readonly isChangingLocale: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  locale,
  messages,
}: {
  readonly children: ReactNode;
  readonly locale: Locale;
  readonly messages: Messages;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const changeLocale = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === locale) return true;

      setIsSaving(true);
      try {
        const response = await fetch("/api/locale", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (!response.ok) return false;

        document.documentElement.lang = nextLocale;
        startTransition(() => router.refresh());
        return true;
      } catch {
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [locale, router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      messages,
      changeLocale,
      isChangingLocale: isSaving || isRefreshing,
    }),
    [changeLocale, isRefreshing, isSaving, locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider.");
  return value;
}
