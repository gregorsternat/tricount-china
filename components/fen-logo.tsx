import { cn } from "@/lib/utils";

export function FenLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Fēn">
      <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[#1d2d27] text-sm font-semibold text-white shadow-[0_8px_24px_rgba(29,45,39,0.18)]">
        <span className="absolute -right-2 -top-3 size-7 rounded-full bg-[#dc5a3d]" />
        <span className="relative">分</span>
      </div>
      <div className={cn("leading-none", compact && "hidden sm:block lg:hidden")}>
        <p className="text-lg font-semibold tracking-[-0.04em]">Fēn</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Partager simplement
        </p>
      </div>
    </div>
  );
}
