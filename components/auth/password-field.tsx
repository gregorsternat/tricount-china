"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/components/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PasswordFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly description?: string;
  readonly error?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly disabled?: boolean;
}

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  description,
  error,
  minLength,
  maxLength,
  disabled,
}: PasswordFieldProps) {
  const { messages } = useI18n();
  const [visible, setVisible] = useState(false);
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] font-semibold text-[#284b42]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            "h-12 rounded-[14px] border-[#173f35]/15 bg-white px-4 pr-12 text-[15px] shadow-none placeholder:text-[#6b7a72] focus-visible:border-[#466c60] focus-visible:ring-[#c9ff63]/65",
            error && "border-[#b44935] focus-visible:border-[#b44935]",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[11px] text-[#63776e] outline-none transition-colors hover:bg-[#edf0e8] hover:text-[#173f35] focus-visible:ring-2 focus-visible:ring-[#77a52a] disabled:pointer-events-none disabled:opacity-50"
          aria-label={
            visible ? messages.auth.password.hide : messages.auth.password.show
          }
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="size-[18px]" aria-hidden />
          ) : (
            <Eye className="size-[18px]" aria-hidden />
          )}
        </button>
      </div>
      {description ? (
        <p id={descriptionId} className="text-xs leading-5 text-[#5d6f66]">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-[#a13e2b]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
