import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-[#d9eadf] text-[#214a37]",
  "bg-[#f6d9d0] text-[#7d3426]",
  "bg-[#dfe5f6] text-[#314a7a]",
  "bg-[#f1e2b9] text-[#66501d]",
  "bg-[#e7dcf3] text-[#563873]",
  "bg-[#d7ecec] text-[#235559]",
];

function colorIndex(id: string) {
  return Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTE.length;
}

export function ParticipantAvatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9 border-2 border-white/80", className)}>
      <AvatarFallback
        className={cn(
          "text-[11px] font-bold tracking-[-0.02em]",
          PALETTE[colorIndex(id)],
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
