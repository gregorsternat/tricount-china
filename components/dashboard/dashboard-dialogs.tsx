"use client";

import { SiAlipay, SiWechat } from "@icons-pack/react-simple-icons";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { Button as MotionButton } from "@/components/motion/button/base";
import { StatefulButton } from "@/components/motion/button/stateful";
import { Checkbox } from "@/components/motion/checkbox";
import { Input as MotionInput } from "@/components/motion/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
  DashboardGroup,
  MemberBalance,
  TransactionCategory,
  TransactionSource,
} from "@/lib/dashboard/types";
import { formatCny, formatNumber, parseAmountToFen } from "@/lib/format";
import { cn } from "@/lib/utils";

type AsyncAction = () => Promise<void> | void;

interface DialogBaseProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface DialogScaffoldProps extends DialogBaseProps {
  readonly title: string;
  readonly description: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly maxWidth?: string;
}

const EXPENSE_CATEGORY_VALUES = [
  "restaurant",
  "groceries",
  "food",
  "transport",
  "housing",
  "shopping",
  "leisure",
  "travel",
  "health",
  "other",
] as const satisfies readonly TransactionCategory[];

const INPUT_CLASS_NAMES = {
  field: "h-12 rounded-xl bg-white",
  input: "text-base",
} as const;

function todayInChina() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = new Map(parts.map((part) => [part.type, part.value]));
  return `${value.get("year")}-${value.get("month")}-${value.get("day")}`;
}

function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    const today = todayInChina();
    return { startsOn: today, endsOn: today };
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    startsOn: `${month}-01`,
    endsOn: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function defaultDateForMonth(month: string) {
  const period = monthBounds(month);
  const today = todayInChina();
  if (today >= period.startsOn && today <= period.endsOn) return today;
  return period.startsOn;
}

function useDialogSubmission(
  action: AsyncAction,
  onSuccess: () => void,
  fallbackError: string,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackError);
    } finally {
      setPending(false);
    }
  };

  return { error, pending, setError, submit };
}

function FormError({ error }: { readonly error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/15 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
    >
      {error}
    </p>
  );
}

function DialogScaffold({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
  onSubmit,
  maxWidth = "sm:max-w-[34rem]",
}: DialogScaffoldProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[calc(100dvh_-_1rem)] min-h-0 w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] flex-col gap-0 overflow-hidden rounded-[24px] border-white/70 bg-[#fbfaf5] p-0 shadow-2xl",
          "sm:max-h-[calc(100dvh_-_3rem)] sm:w-full sm:rounded-[28px]",
          maxWidth,
        )}
      >
        <DialogHeader className="shrink-0 border-b border-black/6 bg-white/65 px-5 py-5 pr-16 text-left sm:px-6 sm:py-6 sm:pr-16">
          <DialogTitle className="text-xl leading-tight tracking-[-0.035em] sm:text-2xl">
            {title}
          </DialogTitle>
          <DialogDescription className="max-w-[46ch] text-sm leading-5">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {children}
          </div>
          <DialogFooter className="shrink-0 border-t border-black/6 bg-white/80 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 sm:pb-4">
            {footer}
          </DialogFooter>
        </form>

        <DialogClose asChild>
          <MotionButton
            type="button"
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            className="absolute right-2 top-2 z-20 size-11 rounded-full bg-white/75 text-muted-foreground shadow-sm sm:right-3 sm:top-3"
          >
            <X className="size-4" aria-hidden />
          </MotionButton>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function DialogSelect({
  label,
  value,
  placeholder,
  options,
  onValueChange,
  disabled = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onValueChange: (value: string) => void;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2" role="group" aria-label={label}>
      <span className="block px-1 text-sm font-medium text-foreground">
        {label}
      </span>
      <Select
        value={value}
        open={open}
        onOpenChange={setOpen}
        onValueChange={onValueChange}
        disabled={disabled}
        className={cn(open && "z-30")}
      >
        <SelectTrigger className="min-h-12 rounded-xl bg-white px-3 text-base">
          <span className="sr-only">{label}: </span>
          <SelectValue placeholder={placeholder} className="truncate text-base" />
        </SelectTrigger>
        <SelectContent className="max-h-60 [&>div]:max-h-60 [&>div]:overflow-y-auto">
          {options.map((option) => (
            <SelectItem
              key={option.value || "empty"}
              value={option.value}
              className="min-h-11 px-3 py-2 text-base"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface CreateGroupPayload {
  readonly name: string;
  readonly city: string;
  readonly inviteEmails: readonly string[];
  readonly month: string;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  month,
  onCreate,
}: DialogBaseProps & {
  readonly month: string;
  readonly onCreate: (payload: CreateGroupPayload) => Promise<void> | void;
}) {
  const { messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const [name, setName] = useState("");
  const [city, setCity] = useState("Beijing");
  const [emails, setEmails] = useState("");

  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      if (name.trim().length < 2) {
        throw new Error(dialogMessages.group.nameError);
      }
      if (!city.trim()) throw new Error(dialogMessages.common.error);

      const inviteEmails = [
        ...new Set(
          emails
            .split(/[\n,;]/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      if (inviteEmails.length > 4) {
        throw new Error(dialogMessages.group.emailLimit);
      }
      if (inviteEmails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
        throw new Error(dialogMessages.member.emailError);
      }

      return onCreate({
        name: name.trim(),
        city: city.trim(),
        inviteEmails,
        month,
      });
    },
    () => {
      setName("");
      setEmails("");
      onOpenChange(false);
    },
    dialogMessages.common.error,
  );

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={dialogMessages.group.title}
      description={dialogMessages.group.description}
      closeLabel={dialogMessages.common.cancel}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void submit();
      }}
      footer={
        <>
          <MotionButton
            type="button"
            variant="ghost"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            {dialogMessages.common.cancel}
          </MotionButton>
          <StatefulButton
            type="submit"
            state={pending ? "loading" : "idle"}
            loadingText={dialogMessages.group.submit}
            icon={<UserPlus className="size-4" />}
            size="lg"
            className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto"
          >
            {dialogMessages.group.submit}
          </StatefulButton>
        </>
      }
    >
      <MotionInput
        id="group-name"
        label={dialogMessages.group.name}
        autoComplete="off"
        autoFocus
        value={name}
        onChange={(value) => {
          setName(value);
          setError(null);
        }}
        placeholder={dialogMessages.group.namePlaceholder}
        classNames={INPUT_CLASS_NAMES}
      />
      <MotionInput
        id="group-city"
        label={dialogMessages.group.city}
        autoComplete="address-level2"
        value={city}
        onChange={(value) => {
          setCity(value);
          setError(null);
        }}
        placeholder={dialogMessages.group.cityPlaceholder}
        classNames={INPUT_CLASS_NAMES}
      />
      <div className="space-y-2">
        <Label htmlFor="group-emails" className="px-1 text-sm">
          {dialogMessages.group.emails}
        </Label>
        <textarea
          id="group-emails"
          value={emails}
          onChange={(event) => {
            setEmails(event.target.value);
            setError(null);
          }}
          rows={3}
          placeholder={dialogMessages.group.emailsPlaceholder}
          aria-describedby="group-emails-help"
          className="min-h-24 w-full resize-none rounded-xl border bg-white px-3.5 py-3 text-base leading-6 outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-ring/40"
        />
        <p id="group-emails-help" className="px-1 text-xs text-muted-foreground">
          {dialogMessages.group.emailLimit}
        </p>
      </div>
      <FormError error={error} />
    </DialogScaffold>
  );
}

export interface AddExpensePayload {
  readonly title: string;
  readonly amountFen: number;
  readonly occurredAt: string;
  readonly category: TransactionCategory;
  readonly month: string;
  readonly groupId?: string;
  readonly participantIds: readonly string[];
}

export function ShareTransactionDialog({
  open,
  onOpenChange,
  transaction,
  groups,
  selectedGroupId,
  onShare,
}: DialogBaseProps & {
  readonly transaction: { readonly title: string; readonly amountFen: number } | null;
  readonly groups: readonly DashboardGroup[];
  readonly selectedGroupId?: string;
  readonly onShare: (groupId: string) => Promise<void> | void;
}) {
  const { locale, messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const [groupId, setGroupId] = useState(selectedGroupId ?? "");
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      if (!transaction) throw new Error(dialogMessages.common.error);
      if (!groupId) throw new Error(dialogMessages.share.selectGroup);
      return onShare(groupId);
    },
    () => onOpenChange(false),
    dialogMessages.common.error,
  );

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={dialogMessages.share.title}
      description={dialogMessages.share.description}
      closeLabel={dialogMessages.common.cancel}
      maxWidth="sm:max-w-[31rem]"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void submit();
      }}
      footer={
        <>
          <MotionButton
            type="button"
            variant="ghost"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            {dialogMessages.common.cancel}
          </MotionButton>
          <StatefulButton
            type="submit"
            state={pending ? "loading" : "idle"}
            loadingText={dialogMessages.share.submit}
            icon={<Users className="size-4" />}
            disabled={!transaction || !groupId}
            size="lg"
            className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto"
          >
            {dialogMessages.share.submit}
          </StatefulButton>
        </>
      }
    >
      <div className="rounded-2xl border border-black/6 bg-white px-4 py-3">
        <p className="truncate text-sm font-medium">
          {transaction?.title ?? dialogMessages.common.error}
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {formatCny(transaction?.amountFen ?? 0, false, locale)}
        </p>
      </div>
      <DialogSelect
        label={dialogMessages.share.group}
        value={groupId}
        placeholder={dialogMessages.share.selectGroup}
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
        onValueChange={(value) => {
          setGroupId(value);
          setError(null);
        }}
      />
      <FormError error={error} />
    </DialogScaffold>
  );
}

export function AddExpenseDialog({
  open,
  onOpenChange,
  groups,
  selectedGroupId,
  members,
  month,
  onCreate,
}: DialogBaseProps & {
  readonly groups: readonly DashboardGroup[];
  readonly selectedGroupId?: string;
  readonly members: readonly MemberBalance[];
  readonly month: string;
  readonly onCreate: (payload: AddExpensePayload) => Promise<void> | void;
}) {
  const { locale, messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const categoryMessages = messages.dashboard.categories;
  const period = monthBounds(month);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => defaultDateForMonth(month));
  const [category, setCategory] = useState<TransactionCategory>("restaurant");
  const [groupId, setGroupId] = useState(selectedGroupId ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(() =>
    members.map((member) => member.id),
  );

  const participantsAvailable =
    Boolean(groupId) &&
    members.length > 0 &&
    (!selectedGroupId || groupId === selectedGroupId);
  const categoryOptions = EXPENSE_CATEGORY_VALUES.map((value) => ({
    value,
    label: categoryMessages[value],
  }));
  const groupOptions = [
    { value: "", label: dialogMessages.expense.personal },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];

  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      const amountFen = parseAmountToFen(amount);
      if (title.trim().length < 2) {
        throw new Error(dialogMessages.expense.nameError);
      }
      if (amountFen === null) {
        throw new Error(dialogMessages.expense.amountError);
      }
      if (!date || date < period.startsOn || date > period.endsOn) {
        throw new Error(dialogMessages.common.error);
      }
      if (participantsAvailable && participantIds.length === 0) {
        throw new Error(dialogMessages.expense.participantsError);
      }
      return onCreate({
        title: title.trim(),
        amountFen,
        occurredAt: `${date}T12:00:00+08:00`,
        category,
        month,
        groupId: groupId || undefined,
        participantIds: groupId && participantsAvailable ? participantIds : [],
      });
    },
    () => {
      setTitle("");
      setAmount("");
      onOpenChange(false);
    },
    dialogMessages.common.error,
  );

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={dialogMessages.expense.title}
      description={dialogMessages.expense.description}
      closeLabel={dialogMessages.common.cancel}
      maxWidth="sm:max-w-[36rem]"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void submit();
      }}
      footer={
        <>
          <MotionButton type="button" variant="ghost" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {dialogMessages.common.cancel}
          </MotionButton>
          <StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={dialogMessages.expense.submit} icon={<Check className="size-4" />} size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto">
            {dialogMessages.expense.submit}
          </StatefulButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <MotionInput id="expense-title" label={dialogMessages.expense.name} autoFocus value={title} onChange={(value) => { setTitle(value); setError(null); }} placeholder={dialogMessages.expense.namePlaceholder} classNames={INPUT_CLASS_NAMES} />
        <MotionInput id="expense-amount" label={dialogMessages.expense.amount} inputMode="decimal" value={amount} onChange={(value) => { setAmount(value); setError(null); }} placeholder={locale === "fr" ? "128,50" : "128.50"} classNames={{ ...INPUT_CLASS_NAMES, input: "text-right text-base tabular-nums" }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MotionInput id="expense-date" type="date" label={dialogMessages.expense.date} min={period.startsOn} max={period.endsOn} value={date} onChange={(value) => { setDate(value); setError(null); }} classNames={INPUT_CLASS_NAMES} />
        <DialogSelect label={dialogMessages.expense.category} value={category} placeholder={dialogMessages.expense.category} options={categoryOptions} onValueChange={(value) => { setCategory(value as TransactionCategory); setError(null); }} />
      </div>
      <DialogSelect
        label={dialogMessages.expense.group}
        value={groupId}
        placeholder={dialogMessages.expense.personal}
        options={groupOptions}
        onValueChange={(value) => {
          setGroupId(value);
          setParticipantIds(value && (!selectedGroupId || value === selectedGroupId) ? members.map((member) => member.id) : []);
          setError(null);
        }}
      />
      {participantsAvailable ? (
        <fieldset className="space-y-2">
          <legend className="px-1 text-sm font-medium">{dialogMessages.expense.participants}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((member) => {
              const checked = participantIds.includes(member.id);
              return (
                <Checkbox
                  key={member.id}
                  checked={checked}
                  onCheckedChange={() => {
                    setParticipantIds((current) => checked ? current.filter((id) => id !== member.id) : [...current, member.id]);
                    setError(null);
                  }}
                  label={member.name}
                  className={cn("min-h-11 rounded-xl border px-3 py-2 text-sm transition-colors", checked ? "border-[#8fbd5e] bg-[#eff8dd]" : "border-border bg-white")}
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <FormError error={error} />
    </DialogScaffold>
  );
}

interface ImportPreview {
  readonly importId: string;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly totalFen: number;
}

export function ImportWalletDialog({
  open,
  onOpenChange,
  initialSource,
  onPreview,
  onConfirm,
}: DialogBaseProps & {
  readonly initialSource?: Exclude<TransactionSource, "manual">;
  readonly onPreview: (source: Exclude<TransactionSource, "manual">, file: File) => Promise<ImportPreview>;
  readonly onConfirm: (preview: ImportPreview) => Promise<void> | void;
}) {
  const { locale, messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const [source, setSource] = useState<Exclude<TransactionSource, "manual">>(initialSource ?? "wechat");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [step, setStep] = useState<"select" | "review" | "done">("select");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readableSize = useMemo(() => {
    if (!file) return null;
    if (file.size < 1_000_000) return `${formatNumber(Math.max(1, Math.round(file.size / 1_000)), locale)} KB`;
    return `${formatNumber(file.size / 1_000_000, locale, { maximumFractionDigits: 1 })} MB`;
  }, [file, locale]);

  const previewImport = async () => {
    if (pending) return;
    if (!file) { setError(dialogMessages.import.missingFile); return; }
    if (file.size > 12 * 1024 * 1024) { setError(dialogMessages.import.fileTooLarge); return; }
    setPending(true);
    setError(null);
    try {
      setPreview(await onPreview(source, file));
      setStep("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : dialogMessages.import.analysisError);
    } finally {
      setPending(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(preview);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : dialogMessages.import.importError);
    } finally {
      setPending(false);
    }
  };

  const description = step === "select" ? dialogMessages.import.selectDescription : step === "review" ? dialogMessages.import.reviewDescription : dialogMessages.import.doneDescription;
  const footer = step === "select" ? (
    <>
      <MotionButton type="button" variant="ghost" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>{dialogMessages.common.cancel}</MotionButton>
      <StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={dialogMessages.import.analyse} icon={<ArrowRight className="size-4" />} size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto">{dialogMessages.import.analyse}</StatefulButton>
    </>
  ) : step === "review" ? (
    <>
      <MotionButton type="button" variant="ghost" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => { setStep("select"); setError(null); }}><ArrowLeft className="size-4" aria-hidden />{dialogMessages.common.back}</MotionButton>
      <StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={dialogMessages.import.importRows} icon={<Check className="size-4" />} size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto">{dialogMessages.import.importRows} ({formatNumber(preview?.accepted ?? 0, locale)})</StatefulButton>
    </>
  ) : (
    <MotionButton type="button" variant="primary" size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto" onClick={() => onOpenChange(false)}>{dialogMessages.import.viewDashboard}</MotionButton>
  );

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={dialogMessages.import.title}
      description={description}
      closeLabel={dialogMessages.common.cancel}
      maxWidth="sm:max-w-[38rem]"
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "select") void previewImport();
        if (step === "review") void confirmImport();
        if (step === "done") onOpenChange(false);
      }}
      footer={footer}
    >
      {step === "select" ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={dialogMessages.import.title}>
            <MotionButton type="button" variant="outline" size="lg" role="radio" aria-checked={source === "wechat"} onClick={() => { if (source !== "wechat") setFile(null); setSource("wechat"); setError(null); }} className={cn("min-h-[4.5rem] w-full justify-start rounded-2xl px-3 text-left", source === "wechat" && "border-[#44b959] bg-[#eef9ec]")}>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#07c160] text-white"><SiWechat size={21} aria-hidden /></span>
              <span><strong className="block text-sm">WeChat Pay</strong><span className="block text-xs font-normal text-muted-foreground">CSV / XLSX</span></span>
            </MotionButton>
            <MotionButton type="button" variant="outline" size="lg" role="radio" aria-checked={source === "alipay"} onClick={() => { if (source !== "alipay") setFile(null); setSource("alipay"); setError(null); }} className={cn("min-h-[4.5rem] w-full justify-start rounded-2xl px-3 text-left", source === "alipay" && "border-[#55a6ff] bg-[#edf6ff]")}>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#1677ff] text-white"><SiAlipay size={22} aria-hidden /></span>
              <span><strong className="block text-sm">Alipay</strong><span className="block text-xs font-normal text-muted-foreground">CSV</span></span>
            </MotionButton>
          </div>
          <label htmlFor="wallet-import-file" className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[#b9c7bd] bg-white px-5 py-6 text-center outline-none transition hover:border-[#79a950] focus-within:border-[#79a950] focus-within:ring-2 focus-within:ring-[#a8d765]/30">
            <input id="wallet-import-file" type="file" accept={source === "wechat" ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"} className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} />
            {file ? <FileSpreadsheet className="size-8 text-[#4e7c41]" aria-hidden /> : <Upload className="size-8 text-[#668076]" aria-hidden />}
            <strong className="mt-3 max-w-full truncate text-sm">{file?.name ?? dialogMessages.import.filePrompt}</strong>
            <span className="mt-1 text-xs text-muted-foreground">{readableSize ?? dialogMessages.import.maxSize}</span>
          </label>
        </>
      ) : null}
      {step === "review" && preview ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <ImportMetric label={dialogMessages.import.newRows} value={formatNumber(preview.accepted, locale)} tone="green" />
            <ImportMetric label={dialogMessages.import.duplicates} value={formatNumber(preview.duplicates, locale)} tone="neutral" />
            <ImportMetric label={dialogMessages.import.rejected} value={formatNumber(preview.rejected, locale)} tone="orange" />
          </div>
          <div className="rounded-[22px] bg-[#173f35] px-5 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{dialogMessages.import.analysedTotal}</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] tabular-nums">{formatCny(preview.totalFen, false, locale)}</p>
          </div>
        </>
      ) : null}
      {step === "done" ? (
        <div className="flex min-h-48 flex-col items-center justify-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-[#c9ff63] text-[#173f35]"><Check className="size-7" aria-hidden /></span>
          <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em]">{dialogMessages.import.complete}</h3>
        </div>
      ) : null}
      <FormError error={error} />
    </DialogScaffold>
  );
}

function ImportMetric({ label, value, tone }: { readonly label: string; readonly value: string; readonly tone: "green" | "orange" | "neutral" }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border px-2.5 py-3 sm:px-4 sm:py-4", tone === "green" && "border-[#cde5b1] bg-[#f2f8e8]", tone === "orange" && "border-[#f1d2b7] bg-[#fff4e9]", tone === "neutral" && "border-[#deddd7] bg-white")}>
      <p className="truncate text-xl font-semibold tracking-[-0.04em] tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

export function AddMemberDialog({
  open,
  onOpenChange,
  groupName,
  onInvite,
}: DialogBaseProps & {
  readonly groupName: string;
  readonly onInvite: (email: string) => Promise<void> | void;
}) {
  const { messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const [email, setEmail] = useState("");
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      const normalized = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error(dialogMessages.member.emailError);
      return onInvite(normalized);
    },
    () => { setEmail(""); onOpenChange(false); },
    dialogMessages.common.error,
  );

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={`${dialogMessages.member.title} ${groupName}`}
      description={dialogMessages.member.description}
      closeLabel={dialogMessages.common.cancel}
      maxWidth="sm:max-w-[31rem]"
      onSubmit={(event) => { event.preventDefault(); setError(null); void submit(); }}
      footer={<><MotionButton type="button" variant="ghost" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>{dialogMessages.common.cancel}</MotionButton><StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={dialogMessages.member.submit} icon={<UserPlus className="size-4" />} size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto">{dialogMessages.member.submit}</StatefulButton></>}
    >
      <MotionInput id="member-email" type="email" label={dialogMessages.member.email} autoComplete="email" autoFocus value={email} onChange={(value) => { setEmail(value); setError(null); }} placeholder="friend@example.com" classNames={INPUT_CLASS_NAMES} />
      <FormError error={error} />
    </DialogScaffold>
  );
}

export function BudgetDialog({
  open,
  onOpenChange,
  currentBudgetFen,
  onSave,
}: DialogBaseProps & {
  readonly currentBudgetFen: number;
  readonly onSave: (budgetFen: number) => Promise<void> | void;
}) {
  const { messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const [amount, setAmount] = useState(currentBudgetFen > 0 ? String(currentBudgetFen / 100) : "");
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      const budgetFen = parseAmountToFen(amount);
      if (budgetFen === null) throw new Error(dialogMessages.budget.amountError);
      return onSave(budgetFen);
    },
    () => onOpenChange(false),
    dialogMessages.common.error,
  );

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={dialogMessages.budget.title}
      description={dialogMessages.budget.description}
      closeLabel={dialogMessages.common.cancel}
      maxWidth="sm:max-w-[29rem]"
      onSubmit={(event) => { event.preventDefault(); setError(null); void submit(); }}
      footer={<><MotionButton type="button" variant="ghost" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>{dialogMessages.common.cancel}</MotionButton><StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={dialogMessages.budget.submit} icon={<Check className="size-4" />} size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto">{dialogMessages.budget.submit}</StatefulButton></>}
    >
      <MotionInput id="budget-amount" label={dialogMessages.budget.amount} inputMode="decimal" autoFocus value={amount} onChange={(value) => { setAmount(value); setError(null); }} classNames={{ ...INPUT_CLASS_NAMES, field: "h-14 rounded-xl bg-white", input: "text-xl font-semibold tabular-nums" }} />
      <FormError error={error} />
    </DialogScaffold>
  );
}

export function SettlementDialog({
  open,
  onOpenChange,
  member,
  currentUserBalanceFen,
  onSettle,
}: DialogBaseProps & {
  readonly member: MemberBalance | null;
  readonly currentUserBalanceFen: number;
  readonly onSettle: (memberId: string, amountFen: number) => Promise<void> | void;
}) {
  const { locale, messages } = useI18n();
  const dialogMessages = messages.dashboard.dialogs;
  const suggestedAmount = Math.min(Math.abs(member?.balanceFen ?? 0), Math.abs(currentUserBalanceFen));
  const [amount, setAmount] = useState(suggestedAmount > 0 ? (suggestedAmount / 100).toFixed(2) : "");
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      if (!member) throw new Error(dialogMessages.settlement.missingMember);
      const amountFen = parseAmountToFen(amount);
      if (amountFen === null) throw new Error(dialogMessages.settlement.amountError);
      if (amountFen > suggestedAmount) throw new Error(`${dialogMessages.settlement.maximumError} ${formatCny(suggestedAmount, false, locale)}`);
      return onSettle(member.id, amountFen);
    },
    () => onOpenChange(false),
    dialogMessages.common.error,
  );
  const title = member ? `${dialogMessages.settlement.title} ${member.name}` : dialogMessages.settlement.title;

  return (
    <DialogScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={dialogMessages.settlement.description}
      closeLabel={dialogMessages.common.cancel}
      maxWidth="sm:max-w-[29rem]"
      onSubmit={(event) => { event.preventDefault(); setError(null); void submit(); }}
      footer={<><MotionButton type="button" variant="ghost" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>{dialogMessages.common.cancel}</MotionButton><StatefulButton type="submit" state={pending ? "loading" : "idle"} loadingText={dialogMessages.settlement.submit} icon={<Check className="size-4" />} disabled={!member || suggestedAmount <= 0} size="lg" className="min-h-11 w-full bg-[#173f35] text-white hover:bg-[#245848] sm:w-auto">{dialogMessages.settlement.submit}</StatefulButton></>}
    >
      <MotionInput id="settlement-amount" label={dialogMessages.settlement.amount} inputMode="decimal" max={suggestedAmount / 100} autoFocus value={amount} onChange={(value) => { setAmount(value); setError(null); }} classNames={{ ...INPUT_CLASS_NAMES, field: "h-14 rounded-xl bg-white", input: "text-xl font-semibold tabular-nums" }} />
      <FormError error={error} />
    </DialogScaffold>
  );
}
