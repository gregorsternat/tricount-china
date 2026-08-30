"use client";

import { useCallback, useEffect, useState } from "react";

import type { ExchangeRateResponse } from "@/app/api/exchange-rate/route";

const CACHE_KEY = "fen.exchange-rate.cny-eur.v1";

export type ExchangeRateState = {
  rate: number | null;
  asOf: string | null;
  fetchedAt: string | null;
  source: string;
  status: "loading" | "fresh" | "cached" | "offline";
  refresh: () => Promise<void>;
};

function readCachedRate(): ExchangeRateResponse | null {
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as Partial<ExchangeRateResponse>;
    if (
      parsed.base !== "CNY" ||
      parsed.quote !== "EUR" ||
      !Number.isFinite(parsed.rate) ||
      Number(parsed.rate) <= 0 ||
      typeof parsed.asOf !== "string" ||
      typeof parsed.fetchedAt !== "string"
    ) {
      return null;
    }
    return parsed as ExchangeRateResponse;
  } catch {
    return null;
  }
}

export function useExchangeRate(): ExchangeRateState {
  const [state, setState] = useState<Omit<ExchangeRateState, "refresh">>(() => ({
    rate: null,
    asOf: null,
    fetchedAt: null,
    source: "Estimation hors ligne",
    status: "loading",
  }));

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/exchange-rate", { cache: "no-store" });
      if (!response.ok) throw new Error("Taux indisponible");
      const data = (await response.json()) as ExchangeRateResponse;
      if (!Number.isFinite(data.rate) || data.rate <= 0) {
        throw new Error("Taux invalide");
      }
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      setState({
        rate: data.rate,
        asOf: data.asOf,
        fetchedAt: data.fetchedAt,
        source: data.source,
        status: "fresh",
      });
    } catch {
      const cached = readCachedRate();
      if (cached) {
        setState({
          rate: cached.rate,
          asOf: cached.asOf,
          fetchedAt: cached.fetchedAt,
          source: cached.source,
          status: "cached",
        });
        return;
      }
      setState({
        rate: null,
        asOf: null,
        fetchedAt: null,
        source: "Taux indisponible",
        status: "offline",
      });
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return { ...state, refresh };
}
