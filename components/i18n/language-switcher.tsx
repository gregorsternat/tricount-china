"use client";

import { cn } from "@/lib/utils";

import { useI18n } from "./i18n-provider";

export function LanguageSwitcher({ className }: { readonly className?: string }) {
  const { changeLocale, isChangingLocale, locale, messages } = useI18n();
  const copy = messages.language;

  return (
    <div
      role="group"
      aria-label={copy.label}
      aria-busy={isChangingLocale}
      className={cn(
        "inline-flex rounded-xl border border-[#173f35]/10 bg-white/75 p-1 shadow-sm backdrop-blur",
        className,
      )}
    >
      {([
        ["en", copy.shortEnglish, copy.english],
        ["fr", copy.shortFrench, copy.french],
      ] as const).map(([value, shortLabel, fullLabel]) => (
        <button
          key={value}
          type="button"
          title={fullLabel}
          aria-label={fullLabel}
          aria-pressed={locale === value}
          disabled={isChangingLocale}
          onClick={() => void changeLocale(value)}
          className={cn(
            "min-h-8 rounded-lg px-2.5 text-[11px] font-bold tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#77a52a] disabled:cursor-wait disabled:opacity-60",
            locale === value
              ? "bg-[#173f35] text-white"
              : "text-[#52675d] hover:bg-[#edf0e8] hover:text-[#173f35]",
          )}
        >
          {shortLabel}
        </button>
      ))}
    </div>
  );
}
