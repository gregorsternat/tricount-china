import { CircleCheck, TriangleAlert } from "lucide-react";

interface FormStatusProps {
  readonly kind: "error" | "success";
  readonly message: string;
}

export function FormStatus({ kind, message }: FormStatusProps) {
  const Icon = kind === "success" ? CircleCheck : TriangleAlert;

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={
        kind === "success"
          ? "flex items-start gap-3 rounded-[14px] border border-[#4e8068]/20 bg-[#e7f1e9] px-4 py-3 text-sm leading-5 text-[#24523f]"
          : "flex items-start gap-3 rounded-[14px] border border-[#b44935]/20 bg-[#f9e9e3] px-4 py-3 text-sm leading-5 text-[#8c3425]"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
