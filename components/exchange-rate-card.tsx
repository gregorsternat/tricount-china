"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ExchangeRateState } from "@/hooks/use-exchange-rate";
import { cn } from "@/lib/utils";

function formatRateDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

export function ExchangeRateCard({
  exchange,
  compact = false,
}: {
  exchange: ExchangeRateState;
  compact?: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const date = formatRateDate(exchange.asOf);

  const handleRefresh = async () => {
    setRefreshing(true);
    await exchange.refresh();
    setRefreshing(false);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-white/70 px-3 text-xs font-medium shadow-sm backdrop-blur-sm disabled:opacity-60"
        aria-label="Actualiser le taux RMB vers EUR"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            exchange.status === "fresh" ? "bg-emerald-500" : "bg-amber-500",
          )}
        />
        {exchange.status === "loading"
          ? "Taux en cours…"
          : exchange.rate
            ? `1 ¥ = ${exchange.rate.toFixed(4)} €`
            : "EUR indisponible"}
        <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
      </button>
    );
  }

  return (
    <section className="rounded-[22px] border border-white/70 bg-white/55 p-4 shadow-[0_12px_40px_rgba(52,43,31,0.06)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            RMB → EUR
          </p>
          <p className="mt-2 text-base font-semibold tabular-nums tracking-[-0.03em]">
            {exchange.rate ? `1 ¥ = ${exchange.rate.toFixed(4)} €` : "Taux indisponible"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Actualiser le taux"
        >
          {exchange.status === "offline" ? (
            <WifiOff className="size-4" />
          ) : (
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          )}
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {exchange.status === "loading"
          ? "Récupération du dernier taux…"
          : exchange.status === "offline"
            ? "Aucune estimation EUR sans connexion."
            : `${exchange.status === "cached" ? "Dernier taux connu" : "Taux de référence"}${date ? ` du ${date}` : ""}.`}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground/75">
        Statistiques BCE · taux indicatif
      </p>
    </section>
  );
}
