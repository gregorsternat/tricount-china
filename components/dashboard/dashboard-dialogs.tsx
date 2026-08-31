"use client";

import { SiAlipay, SiWechat } from "@icons-pack/react-simple-icons";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  DashboardGroup,
  MemberBalance,
  TransactionCategory,
  TransactionSource,
} from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type AsyncAction = () => Promise<void> | void;

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

function defaultAcademicYearInChina() {
  const [year, month] = todayInChina().split("-").map(Number);
  const startYear = month >= 7 ? year : year - 1;
  return {
    startsOn: `${startYear}-09-01`,
    endsOn: `${startYear + 1}-06-30`,
  };
}

function clampDate(value: string, startsOn: string, endsOn: string) {
  if (value < startsOn) return startsOn;
  if (value > endsOn) return endsOn;
  return value;
}

interface DialogBaseProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function useDialogSubmission(action: AsyncAction, onSuccess: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await action();
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  };

  return { error, pending, setError, submit };
}

function FormError({ error }: { readonly error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-[#fff0eb] px-3 py-2 text-sm text-[#a53b22]">
      {error}
    </p>
  );
}

export interface CreateGroupPayload {
  readonly name: string;
  readonly city: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly inviteEmails: readonly string[];
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  onCreate,
}: DialogBaseProps & {
  readonly onCreate: (payload: CreateGroupPayload) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("Beijing");
  const [startsOn, setStartsOn] = useState(() => defaultAcademicYearInChina().startsOn);
  const [endsOn, setEndsOn] = useState(() => defaultAcademicYearInChina().endsOn);
  const [emails, setEmails] = useState("");

  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      if (name.trim().length < 2) throw new Error("Donne un nom au groupe.");
      if (!startsOn || !endsOn || startsOn > endsOn) {
        throw new Error("Vérifie les dates de début et de fin.");
      }
      const inviteEmails = [
        ...new Set(
          emails
            .split(/[\n,;]/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      if (inviteEmails.length > 4) {
        throw new Error("Invite au maximum 4 amis à la création, puis ajoute les autres depuis le tricount.");
      }
      return onCreate({ name: name.trim(), city: city.trim(), startsOn, endsOn, inviteEmails });
    },
    () => {
      setName("");
      setEmails("");
      onOpenChange(false);
    },
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[28px] border-white/70 bg-[#fbfaf5] p-0 shadow-2xl sm:max-w-[560px]">
        <div className="bg-[#173f35] px-7 py-7 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-[-0.04em]">Créer un tricount</DialogTitle>
            <DialogDescription className="text-white/65">
              Une année, une coloc ou un voyage. Tu pourras inviter des amis tout de suite.
            </DialogDescription>
          </DialogHeader>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 px-7 pb-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="group-name">Nom du groupe</Label>
              <Input
                id="group-name"
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder="Coloc Beijing"
                className="h-12 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="group-city">Ville ou destination</Label>
              <Input
                id="group-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Beijing"
                className="h-12 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-start">Début</Label>
              <Input
                id="group-start"
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
                className="h-12 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-end">Fin</Label>
              <Input
                id="group-end"
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
                className="h-12 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="group-emails">Amis à inviter (facultatif)</Label>
              <textarea
                id="group-emails"
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
                rows={3}
                placeholder="lea@example.com, yanis@example.com"
                className="w-full resize-none rounded-xl border bg-white px-3 py-3 text-sm outline-none transition focus:border-[#79a950] focus:ring-3 focus:ring-[#a8d765]/25"
              />
              <p className="text-xs leading-5 text-[#6d756f]">
                Jusqu’à 4 amis à la création. Seules les personnes invitées peuvent rejoindre ce projet privé.
              </p>
            </div>
          </div>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-11 rounded-xl bg-[#c9ff63] px-5 text-[#173f35] hover:bg-[#b8ef55]"
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
              Créer et inviter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface AddExpensePayload {
  readonly title: string;
  readonly amountFen: number;
  readonly occurredAt: string;
  readonly category: TransactionCategory;
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
  const [groupId, setGroupId] = useState(selectedGroupId ?? "");
  const selectedGroup = groups.find((group) => group.id === groupId);
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      if (!transaction) throw new Error("Opération introuvable.");
      if (!groupId) throw new Error("Choisis explicitement le tricount destinataire.");
      return onShare(groupId);
    },
    () => onOpenChange(false),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] border-white/70 bg-[#fbfaf5] p-7 shadow-2xl sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Partager cette opération</DialogTitle>
          <DialogDescription>
            Cette action rendra « {transaction?.title ?? "cette opération"} » visible par tous les membres du tricount choisi.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void submit();
          }}
        >
          <div className="rounded-2xl bg-[#edf3ec] px-4 py-3">
            <p className="text-xs font-semibold text-[#68756e]">Montant partagé</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {((transaction?.amountFen ?? 0) / 100).toLocaleString("fr-FR", {
                style: "currency",
                currency: "CNY",
              })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="share-group">Tricount destinataire</Label>
            <select
              id="share-group"
              autoFocus
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value);
                setError(null);
              }}
              className="h-12 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-[#79a950] focus:ring-3 focus:ring-[#a8d765]/25"
            >
              <option value="">Choisir un tricount…</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
          {selectedGroup ? (
            <p className="rounded-xl border border-[#f0d5b5] bg-[#fff6e8] px-3 py-2 text-xs leading-5 text-[#755333]">
              Confirmation : {selectedGroup.memberCount} membre{selectedGroup.memberCount > 1 ? "s" : ""} pourront voir cette dépense.
            </p>
          ) : null}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={pending || !groupId} className="h-11 rounded-xl bg-[#173f35] px-6 text-white hover:bg-[#245848]">
              {pending ? <LoaderCircle className="animate-spin" /> : <Users />}
              Confirmer le partage
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const expenseCategories: readonly { value: TransactionCategory; label: string }[] = [
  { value: "food", label: "Restaurants & courses" },
  { value: "transport", label: "Transports" },
  { value: "housing", label: "Logement" },
  { value: "travel", label: "Voyages" },
  { value: "shopping", label: "Shopping" },
  { value: "leisure", label: "Loisirs" },
  { value: "health", label: "Santé" },
  { value: "other", label: "Autres" },
];

export function AddExpenseDialog({
  open,
  onOpenChange,
  groups,
  selectedGroupId,
  members,
  startsOn,
  endsOn,
  onCreate,
}: DialogBaseProps & {
  readonly groups: readonly DashboardGroup[];
  readonly selectedGroupId?: string;
  readonly members: readonly MemberBalance[];
  readonly startsOn: string;
  readonly endsOn: string;
  readonly onCreate: (payload: AddExpensePayload) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => clampDate(todayInChina(), startsOn, endsOn));
  const [category, setCategory] = useState<TransactionCategory>("food");
  const [groupId, setGroupId] = useState(selectedGroupId ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(() => members.map((member) => member.id));

  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      const parsedAmount = Number(amount.replace(",", "."));
      if (title.trim().length < 2) throw new Error("Ajoute un libellé clair.");
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Saisis un montant supérieur à zéro.");
      }
      if (date < startsOn || date > endsOn) {
        throw new Error("La date doit rester dans la période affichée.");
      }
      if (groupId && participantIds.length === 0) {
        throw new Error("Sélectionne au moins une personne pour le partage.");
      }
      return onCreate({
        title: title.trim(),
        amountFen: Math.round(parsedAmount * 100),
        occurredAt: `${date}T12:00:00+08:00`,
        category,
        groupId: groupId || undefined,
        participantIds,
      });
    },
    () => {
      setTitle("");
      setAmount("");
      onOpenChange(false);
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] border-white/70 bg-[#fbfaf5] p-7 shadow-2xl sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Ajouter une dépense</DialogTitle>
          <DialogDescription>
            Saisie manuelle en RMB. Une dépense personnelle reste privée tant que tu ne la partages pas.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void submit();
          }}
          className="space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label htmlFor="expense-title">Libellé</Label>
              <Input
                id="expense-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Courses de la semaine"
                className="h-12 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Montant (RMB)</Label>
              <Input
                id="expense-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="128,50"
                className="h-12 rounded-xl bg-white text-right tabular-nums"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                min={startsOn}
                max={endsOn}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-12 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-category">Catégorie</Label>
              <select
                id="expense-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as TransactionCategory)}
                className="h-12 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-[#79a950] focus:ring-3 focus:ring-[#a8d765]/25"
              >
                {expenseCategories.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-group">Partager dans un tricount</Label>
            <select
              id="expense-group"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="h-12 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-[#79a950] focus:ring-3 focus:ring-[#a8d765]/25"
            >
              <option value="">Non, garder dans mon portefeuille privé</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
          {groupId && members.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Répartir entre</legend>
              <div className="grid grid-cols-2 gap-2">
                {members.map((member) => {
                  const checked = participantIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
                        checked ? "border-[#8fbd5e] bg-[#eff8dd]" : "bg-white",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setParticipantIds((current) =>
                          checked
                            ? current.filter((id) => id !== member.id)
                            : [...current, member.id],
                        )}
                      />
                      {member.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending} className="h-11 rounded-xl bg-[#173f35] px-6 text-white hover:bg-[#245848]">
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportPreview {
  readonly importId?: string;
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
  readonly onPreview: (
    source: Exclude<TransactionSource, "manual">,
    file: File,
  ) => Promise<ImportPreview>;
  readonly onConfirm: (preview: ImportPreview) => Promise<void> | void;
}) {
  const [source, setSource] = useState<Exclude<TransactionSource, "manual">>(initialSource ?? "wechat");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [step, setStep] = useState<"select" | "review" | "done">("select");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readableSize = useMemo(() => {
    if (!file) return null;
    return file.size > 1_000_000
      ? `${(file.size / 1_000_000).toFixed(1)} Mo`
      : `${Math.max(1, Math.round(file.size / 1_000))} Ko`;
  }, [file]);

  const previewImport = async () => {
    if (!file) {
      setError("Choisis ton export CSV ou XLSX.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Le fichier dépasse la limite de 12 Mo.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const nextPreview = await onPreview(source, file);
      setPreview(nextPreview);
      setStep("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le fichier n’a pas pu être analysé.");
    } finally {
      setPending(false);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(preview);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’import n’a pas pu être enregistré.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[28px] border-white/70 bg-[#fbfaf5] p-0 shadow-2xl sm:max-w-[610px]">
        <div className="border-b bg-white/60 px-7 py-6">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-[-0.04em]">Importer mes transactions</DialogTitle>
            <DialogDescription>
              {step === "select" && "Ajoute l’export téléchargé depuis WeChat Pay ou Alipay."}
              {step === "review" && "Vérifie le résumé avant d’ajouter les lignes à ton portefeuille privé."}
              {step === "done" && "Ton tableau de bord est à jour."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-7 py-6">
          {step === "select" ? (
            <>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Source de l’import">
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "wechat"}
                  onClick={() => {
                    if (source !== "wechat") setFile(null);
                    setSource("wechat");
                    setError(null);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition",
                    source === "wechat" ? "border-[#44b959] bg-[#eef9ec] shadow-sm" : "bg-white hover:border-[#b9c7bd]",
                  )}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[#07c160] text-white"><SiWechat size={21} /></span>
                  <span><strong className="block text-sm">WeChat Pay</strong><span className="text-xs text-[#718078]">CSV ou XLSX</span></span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "alipay"}
                  onClick={() => {
                    if (source !== "alipay") setFile(null);
                    setSource("alipay");
                    setError(null);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition",
                    source === "alipay" ? "border-[#55a6ff] bg-[#edf6ff] shadow-sm" : "bg-white hover:border-[#b9c7bd]",
                  )}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[#1677ff] text-white"><SiAlipay size={22} /></span>
                  <span><strong className="block text-sm">Alipay</strong><span className="text-xs text-[#718078]">CSV exporté</span></span>
                </button>
              </div>

              <label className="group flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[#b9c7bd] bg-white px-6 text-center transition hover:border-[#79a950] hover:bg-[#f7fbea]">
                <input
                  type="file"
                  accept={source === "wechat" ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"}
                  className="sr-only"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
                {file ? <FileSpreadsheet className="size-8 text-[#4e7c41]" /> : <Upload className="size-8 text-[#668076]" />}
                <strong className="mt-3 text-sm">{file ? file.name : "Dépose ou choisis ton export"}</strong>
                <span className="mt-1 text-xs text-[#718078]">
                  {readableSize ?? `${source === "wechat" ? "CSV ou XLSX" : "CSV"} · 12 Mo maximum`}
                </span>
              </label>

              <div className="flex gap-3 rounded-2xl bg-[#edf3ec] px-4 py-3 text-xs leading-5 text-[#52635b]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#4f7c42]" />
                <p>
                  Le fichier brut n’est jamais conservé. Les opérations importées restent privées jusqu’à ce que tu les partages dans un tricount.
                </p>
              </div>
            </>
          ) : null}

          {step === "review" && preview ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <ImportMetric label="Nouvelles" value={preview.accepted.toLocaleString("fr-FR")} tone="green" />
                <ImportMetric label="Doublons" value={preview.duplicates.toLocaleString("fr-FR")} tone="neutral" />
                <ImportMetric label="À vérifier" value={preview.rejected.toLocaleString("fr-FR")} tone="orange" />
              </div>
              <div className="rounded-[22px] bg-[#173f35] px-5 py-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Total analysé</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] tabular-nums">
                  {(preview.totalFen / 100).toLocaleString("fr-FR", { style: "currency", currency: "CNY" })}
                </p>
                <p className="mt-2 text-xs text-white/60">Les remboursements et revenus sont reconnus séparément des dépenses.</p>
              </div>
            </>
          ) : null}

          {step === "done" ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center">
              <span className="grid size-14 place-items-center rounded-full bg-[#c9ff63] text-[#173f35]"><Check className="size-7" /></span>
              <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em]">Import terminé</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#67746d]">
                Les doublons ont été ignorés et les remboursements rapprochés de tes paiements.
              </p>
            </div>
          ) : null}

          <FormError error={error} />
        </div>

        <DialogFooter className="border-t bg-white/60 px-7 py-5">
          {step === "select" ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button type="button" disabled={pending} onClick={() => void previewImport()} className="h-11 rounded-xl bg-[#173f35] px-5 text-white hover:bg-[#245848]">
                {pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                Analyser le fichier
              </Button>
            </>
          ) : null}
          {step === "review" ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep("select")}><ArrowLeft /> Retour</Button>
              <Button type="button" disabled={pending} onClick={() => void confirmImport()} className="h-11 rounded-xl bg-[#c9ff63] px-5 text-[#173f35] hover:bg-[#b8ef55]">
                {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
                Importer {preview?.accepted ?? 0} lignes
              </Button>
            </>
          ) : null}
          {step === "done" ? (
            <Button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-xl bg-[#173f35] px-6 text-white hover:bg-[#245848]">Voir le dashboard</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportMetric({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: "green" | "orange" | "neutral";
}) {
  return (
    <div className={cn(
      "rounded-2xl border px-4 py-4",
      tone === "green" && "border-[#cde5b1] bg-[#f2f8e8]",
      tone === "orange" && "border-[#f1d2b7] bg-[#fff4e9]",
      tone === "neutral" && "border-[#deddd7] bg-white",
    )}>
      <p className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[#6a766f]">{label}</p>
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
  const [email, setEmail] = useState("");
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      const normalized = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Saisis une adresse email valide.");
      return onInvite(normalized);
    },
    () => {
      setEmail("");
      onOpenChange(false);
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] border-white/70 bg-[#fbfaf5] p-7 shadow-2xl sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Inviter dans {groupName}</DialogTitle>
          <DialogDescription>
            Si le compte existe, il est ajouté. Sinon, un lien privé valable 7 jours est créé.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ami@example.com"
              className="h-12 rounded-xl bg-white"
            />
          </div>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={pending} className="h-11 rounded-xl bg-[#173f35] px-5 text-white hover:bg-[#245848]">
              {pending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
              Inviter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const [amount, setAmount] = useState(String(Math.round(currentBudgetFen / 100)));
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      const parsed = Number(amount.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Le budget doit être supérieur à zéro.");
      return onSave(Math.round(parsed * 100));
    },
    () => onOpenChange(false),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] border-white/70 bg-[#fbfaf5] p-7 shadow-2xl sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Budget annuel</DialogTitle>
          <DialogDescription>Définis ton cap en RMB pour l’année académique sélectionnée.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="budget-amount">Budget en RMB</Label>
            <Input
              id="budget-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-14 rounded-xl bg-white text-xl font-semibold tabular-nums"
            />
          </div>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={pending} className="h-11 rounded-xl bg-[#173f35] px-6 text-white hover:bg-[#245848]">
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const suggestedAmount = Math.min(
    Math.abs(member?.balanceFen ?? 0),
    Math.abs(currentUserBalanceFen),
  );
  const [amount, setAmount] = useState(String((suggestedAmount / 100).toFixed(2)));
  const { error, pending, setError, submit } = useDialogSubmission(
    () => {
      if (!member) throw new Error("Membre introuvable.");
      const parsed = Number(amount.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Saisis un montant valide.");
      const amountFen = Math.round(parsed * 100);
      if (amountFen > suggestedAmount) {
        throw new Error(`Le règlement ne peut pas dépasser ${(suggestedAmount / 100).toLocaleString("fr-FR", { style: "currency", currency: "CNY" })}.`);
      }
      return onSettle(member.id, amountFen);
    },
    () => onOpenChange(false),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] border-white/70 bg-[#fbfaf5] p-7 shadow-2xl sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Régler avec {member?.name ?? "ce membre"}</DialogTitle>
          <DialogDescription>Le remboursement sera visible par tous les membres du tricount.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="settlement-amount">Montant (RMB)</Label>
            <Input id="settlement-amount" inputMode="decimal" max={suggestedAmount / 100} value={amount} onChange={(event) => setAmount(event.target.value)} className="h-14 rounded-xl bg-white text-xl font-semibold tabular-nums" />
          </div>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={pending} className="h-11 rounded-xl bg-[#c9ff63] px-6 text-[#173f35] hover:bg-[#b8ef55]">
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Confirmer le remboursement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
