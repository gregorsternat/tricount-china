"use client";

import {
  BedDouble,
  Bike,
  Coffee,
  Landmark,
  ReceiptText,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ParticipantAvatar } from "@/components/participant-avatar";
import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCny, parseAmountToFen, todayInShanghai } from "@/lib/format";
import { splitEvenly } from "@/lib/domain";
import type { ExpenseDraft, LedgerExpense, LedgerGroup } from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Repas", icon: Utensils },
  { value: "transport", label: "Transport", icon: Bike },
  { value: "coffee", label: "Café", icon: Coffee },
  { value: "visit", label: "Sortie", icon: Landmark },
  { value: "shopping", label: "Courses", icon: ShoppingBag },
  { value: "stay", label: "Logement", icon: BedDouble },
  { value: "other", label: "Autre", icon: ReceiptText },
] as const;

function sharesLookEven(expense: LedgerExpense) {
  const expected = splitEvenly(
    expense.amountFen,
    expense.shares.map((share) => share.participantId),
  );
  return expected.every(
    (share, index) => share.amountFen === expense.shares[index]?.amountFen,
  );
}

export function ExpenseDialog({
  group,
  expense,
  onSave,
  onOpenChange,
}: {
  group: LedgerGroup;
  expense?: LedgerExpense;
  onSave: (draft: ExpenseDraft) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const activeParticipants = group.participants.filter(
    (participant) => !participant.archivedAt,
  );
  const initialBeneficiaries = expense
    ? expense.shares.map((share) => share.participantId)
    : activeParticipants.map((participant) => participant.id);
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(
    expense ? (expense.amountFen / 100).toFixed(2).replace(".", ",") : "",
  );
  const [payerId, setPayerId] = useState(
    expense?.payerId ?? group.currentParticipantId ?? activeParticipants[0]?.id ?? "",
  );
  const [occurredAt, setOccurredAt] = useState(
    expense?.occurredAt.slice(0, 10) ?? todayInShanghai(),
  );
  const [category, setCategory] = useState<LedgerExpense["category"]>(
    expense?.category ?? "food",
  );
  const [note, setNote] = useState(expense?.note ?? "");
  const [beneficiaryIds, setBeneficiaryIds] = useState<string[]>(
    initialBeneficiaries,
  );
  const [splitMode, setSplitMode] = useState<"equal" | "exact">(
    expense && !sharesLookEven(expense) ? "exact" : "equal",
  );
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      expense?.shares.map((share) => [
        share.participantId,
        (share.amountFen / 100).toFixed(2).replace(".", ","),
      ]) ?? [],
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<ButtonState>("idle");

  const amountFen = parseAmountToFen(amount);
  const evenShares = useMemo(
    () =>
      amountFen && beneficiaryIds.length
        ? splitEvenly(amountFen, beneficiaryIds)
        : [],
    [amountFen, beneficiaryIds],
  );
  const exactTotalFen = beneficiaryIds.reduce(
    (sum, id) => sum + (parseAmountToFen(exactAmounts[id] ?? "") ?? 0),
    0,
  );

  const toggleBeneficiary = (participantId: string, checked: boolean) => {
    setBeneficiaryIds((current) =>
      checked
        ? [...current, participantId]
        : current.filter((id) => id !== participantId),
    );
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Ajoute un libellé pour cette dépense.");
      return;
    }
    if (!amountFen) {
      setError("Saisis un montant RMB valide, avec deux décimales maximum.");
      return;
    }
    if (!payerId) {
      setError("Choisis la personne qui a payé.");
      return;
    }
    if (!beneficiaryIds.length) {
      setError("Sélectionne au moins une personne concernée.");
      return;
    }

    const shares =
      splitMode === "equal"
        ? splitEvenly(amountFen, beneficiaryIds)
        : beneficiaryIds.map((participantId) => ({
            participantId,
            amountFen: parseAmountToFen(exactAmounts[participantId] ?? "") ?? 0,
          }));

    if (splitMode === "exact" && exactTotalFen !== amountFen) {
      setError(
        `Les parts font ${formatCny(exactTotalFen)} au lieu de ${formatCny(amountFen)}.`,
      );
      return;
    }

    setButtonState("loading");
    onSave({
      title: title.trim(),
      amountFen,
      payerId,
      shares,
      occurredAt,
      category,
      note: note.trim() || undefined,
    });
    setButtonState("success");
    window.setTimeout(() => onOpenChange(false), 380);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 top-auto max-h-[94dvh] w-full max-w-none translate-x-[-50%] translate-y-0 overflow-y-auto rounded-b-none rounded-t-[28px] border-white/80 bg-[#fbfaf7] p-0 shadow-[0_-20px_80px_rgba(34,31,25,0.18)] sm:bottom-auto sm:top-1/2 sm:max-h-[90dvh] sm:max-w-2xl sm:translate-y-[-50%] sm:rounded-[28px]">
        <DialogHeader className="sticky top-0 z-10 border-b border-border/70 bg-[#fbfaf7]/95 px-5 pb-4 pt-6 text-left backdrop-blur-xl sm:px-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#b14a35]">
            {expense ? "Modifier" : "Nouvelle dépense"}
          </p>
          <DialogTitle className="text-2xl tracking-[-0.04em]">
            {expense ? "Ajuster la dépense" : "Qui a payé quoi ?"}
          </DialogTitle>
          <DialogDescription>
            Les comptes restent en RMB. La conversion EUR est seulement indicative.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-7 px-5 pb-8 pt-6 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label htmlFor="expense-title">Dépense</Label>
              <Input
                id="expense-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Fondue, taxi, musée…"
                className="h-12 rounded-xl bg-white"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Montant en RMB</Label>
              <div className="relative">
                <Input
                  id="expense-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="h-12 rounded-xl bg-white pr-12 text-right text-lg font-semibold tabular-nums"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">
                  ¥
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FieldSelect
              id="expense-payer"
              label="Payé par"
              value={payerId}
              onChange={setPayerId}
              options={activeParticipants.map((participant) => ({
                value: participant.id,
                label: participant.name,
              }))}
            />
            <FieldSelect
              id="expense-category"
              label="Catégorie"
              value={category}
              onChange={(value) => setCategory(value as LedgerExpense["category"])}
              options={EXPENSE_CATEGORIES.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
            />
            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                className="h-11 rounded-xl bg-white"
              />
            </div>
          </div>

          <fieldset className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <legend className="text-sm font-semibold">Pour qui ?</legend>
                <p className="mt-1 text-xs text-muted-foreground">
                  Décoche les personnes non concernées.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBeneficiaryIds(activeParticipants.map((participant) => participant.id))
                }
                className="min-h-10 px-2 text-xs font-semibold text-[#a34432]"
              >
                Tout le monde
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeParticipants.map((participant) => {
                const checked = beneficiaryIds.includes(participant.id);
                return (
                  <label
                    key={participant.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-3 transition-colors",
                      checked
                        ? "border-[#bd604c]/35 bg-[#f8e8e2]"
                        : "border-border bg-white text-muted-foreground",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleBeneficiary(participant.id, value === true)
                      }
                    />
                    <ParticipantAvatar
                      id={participant.id}
                      name={participant.name}
                      className="size-8"
                    />
                    <span className="text-sm font-medium">{participant.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Comment partager ?</legend>
            <div className="grid grid-cols-2 rounded-2xl bg-[#eeeae2] p-1">
              {([
                ["equal", "À parts égales"],
                ["exact", "Montants exacts"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSplitMode(value)}
                  className={cn(
                    "min-h-11 rounded-xl px-3 text-sm font-semibold transition-all",
                    splitMode === value
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                  aria-pressed={splitMode === value}
                >
                  {label}
                </button>
              ))}
            </div>

            {splitMode === "equal" ? (
              <div className="rounded-2xl border border-dashed border-[#9eb7a7] bg-[#edf5ef] px-4 py-3 text-sm text-[#315943]">
                {amountFen && evenShares.length
                  ? evenShares
                      .map((share) => {
                        const participant = group.participants.find(
                          (item) => item.id === share.participantId,
                        );
                        return `${participant?.name ?? "?"} ${formatCny(share.amountFen)}`;
                      })
                      .join(" · ")
                  : "Le montant sera réparti au fen près."}
              </div>
            ) : (
              <div className="space-y-2">
                {beneficiaryIds.map((participantId) => {
                  const participant = group.participants.find(
                    (item) => item.id === participantId,
                  );
                  return (
                    <div
                      key={participantId}
                      className="flex items-center gap-3 rounded-2xl border bg-white p-3"
                    >
                      <ParticipantAvatar
                        id={participantId}
                        name={participant?.name ?? "?"}
                        className="size-8"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {participant?.name}
                      </span>
                      <Input
                        value={exactAmounts[participantId] ?? ""}
                        onChange={(event) =>
                          setExactAmounts((current) => ({
                            ...current,
                            [participantId]: event.target.value,
                          }))
                        }
                        inputMode="decimal"
                        aria-label={`Part de ${participant?.name}`}
                        placeholder="0,00"
                        className="h-10 w-28 rounded-xl text-right tabular-nums"
                      />
                      <span className="text-sm font-semibold text-muted-foreground">¥</span>
                    </div>
                  );
                })}
                <p
                  className={cn(
                    "text-right text-xs font-medium tabular-nums",
                    amountFen && exactTotalFen === amountFen
                      ? "text-emerald-700"
                      : "text-muted-foreground",
                  )}
                >
                  Total des parts : {formatCny(exactTotalFen)}
                </p>
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="expense-note">Note (facultatif)</Label>
            <Textarea
              id="expense-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Détails utiles pour le groupe…"
              className="min-h-20 resize-none rounded-xl bg-white"
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {error}
            </div>
          ) : null}

          <StatefulButton
            type="submit"
            state={buttonState}
            loadingText="Enregistrement"
            successText="C’est ajouté"
            className="h-13 w-full rounded-2xl bg-[#1d2d27] text-base text-white hover:bg-[#263b33]"
          >
            {expense ? "Enregistrer les changements" : "Ajouter la dépense"}
          </StatefulButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none ring-ring focus-visible:ring-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
