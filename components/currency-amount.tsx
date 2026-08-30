import { formatCny, formatEurFromFen } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CurrencyAmount({
  fen,
  rate,
  displayCurrency,
  className,
  secondaryClassName,
  showSecondary = true,
}: {
  fen: number;
  rate: number | null;
  displayCurrency: "CNY" | "EUR";
  className?: string;
  secondaryClassName?: string;
  showSecondary?: boolean;
}) {
  const canShowEur = rate !== null;
  const primary =
    displayCurrency === "EUR" && canShowEur
      ? formatEurFromFen(fen, rate)
      : formatCny(fen);
  const secondary =
    displayCurrency === "EUR" || !canShowEur
      ? formatCny(fen)
      : formatEurFromFen(fen, rate);

  return (
    <span className="inline-flex flex-col items-end">
      <span className={cn("tabular-nums", className)}>{primary}</span>
      {showSecondary ? (
        <span
          className={cn(
            "mt-0.5 text-[11px] tabular-nums text-muted-foreground",
            secondaryClassName,
          )}
        >
          {canShowEur && displayCurrency === "CNY" ? "≈ " : ""}
          {secondary}
        </span>
      ) : null}
    </span>
  );
}
