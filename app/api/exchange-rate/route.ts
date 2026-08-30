import { NextResponse } from "next/server";

const ECB_DAILY_RATES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.CNY.EUR.SP00.A?lastNObservations=1&detail=dataonly&format=csvdata";

export const revalidate = 21_600;

export type ExchangeRateResponse = {
  base: "CNY";
  quote: "EUR";
  rate: number;
  cnyPerEur: number;
  asOf: string;
  fetchedAt: string;
  source: "European Central Bank";
};

function parseEcbDailyRates(csv: string) {
  const [headersLine, valuesLine] = csv.trim().split(/\r?\n/);
  const headers = headersLine?.split(",") ?? [];
  const values = valuesLine?.split(",") ?? [];
  const date = values[headers.indexOf("TIME_PERIOD")];
  const cnyPerEur = Number(values[headers.indexOf("OBS_VALUE")]);

  if (!date || !Number.isFinite(cnyPerEur) || cnyPerEur <= 0) {
    throw new Error("La réponse de la BCE ne contient pas de taux CNY valide.");
  }

  return { date, cnyPerEur };
}

export async function GET() {
  try {
    const response = await fetch(ECB_DAILY_RATES_URL, {
      headers: { Accept: "text/csv" },
      next: { revalidate },
      signal: AbortSignal.timeout(6_000),
    });

    if (!response.ok) {
      throw new Error(`La BCE a répondu ${response.status}.`);
    }

    const { date, cnyPerEur } = parseEcbDailyRates(await response.text());
    const payload: ExchangeRateResponse = {
      base: "CNY",
      quote: "EUR",
      rate: 1 / cnyPerEur,
      cnyPerEur,
      asOf: date,
      fetchedAt: new Date().toISOString(),
      source: "European Central Bank",
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Le taux RMB → EUR est temporairement indisponible.",
        detail: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 503 },
    );
  }
}

export const __testables = { parseEcbDailyRates };
