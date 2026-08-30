"use client";

import { Download, Plus, Share2, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { useState } from "react";

import { ParticipantAvatar } from "@/components/participant-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateBalances, simplifyDebts } from "@/lib/domain";
import { formatCny } from "@/lib/format";
import type { LedgerGroup } from "@/lib/ledger-store";

export function MembersPanel({
  group,
  canDeleteGroup,
  onAddParticipant,
  onRenameGroup,
  onDeleteGroup,
  onNotify,
}: {
  group: LedgerGroup;
  canDeleteGroup: boolean;
  onAddParticipant: (name: string) => void;
  onRenameGroup: (name: string) => void;
  onDeleteGroup: () => void;
  onNotify: (title: string, description?: string) => void;
}) {
  const [newMember, setNewMember] = useState("");
  const [groupName, setGroupName] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleAddMember = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newMember.trim()) return;
    onAddParticipant(newMember.trim());
    setNewMember("");
    onNotify("Participant ajouté", "Il peut désormais être inclus dans les dépenses.");
  };

  const buildSummary = () => {
    const expenses = group.expenses.filter((expense) => !expense.deletedAt);
    const balances = calculateBalances(group.participants, expenses, group.settlements);
    const debts = simplifyDebts(balances);
    const names = new Map(group.participants.map((participant) => [participant.id, participant.name]));
    if (!debts.length) return `${group.name} : tout est équilibré ✅`;
    return [
      `${group.name} · remboursements :`,
      ...debts.map(
        (debt) =>
          `• ${names.get(debt.fromParticipantId)} → ${names.get(debt.toParticipantId)} : ${formatCny(debt.amountFen)}`,
      ),
    ].join("\n");
  };

  const shareSummary = async () => {
    const text = buildSummary();
    try {
      if (navigator.share) {
        await navigator.share({ title: group.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      onNotify("Récapitulatif copié", "Prêt à envoyer dans WeChat.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onNotify("Partage impossible", "Tu peux réessayer depuis un navigateur récent.");
    }
  };

  const exportGroup = () => {
    const blob = new Blob([JSON.stringify(group, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${group.name.toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "-") || "fen"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotify("Sauvegarde exportée", "Le fichier JSON est dans tes téléchargements.");
  };

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Le groupe
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Participants</h2>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {group.participants.length}
          </Badge>
        </div>

        <div className="space-y-2">
          {group.participants.map((participant) => (
            <div
              key={participant.id}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/80 bg-white/65 px-3"
            >
              <ParticipantAvatar id={participant.id} name={participant.name} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{participant.name}</p>
              {participant.id === group.currentParticipantId ? (
                <Badge className="rounded-full bg-[#e0eee4] text-[#315943] hover:bg-[#e0eee4]">
                  Toi
                </Badge>
              ) : null}
            </div>
          ))}
        </div>

        <form onSubmit={handleAddMember} className="mt-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <UserRoundPlus className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={newMember}
              onChange={(event) => setNewMember(event.target.value)}
              placeholder="Ajouter un prénom"
              aria-label="Nom du nouveau participant"
              className="h-11 rounded-xl bg-white pl-10"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="size-11 rounded-xl bg-[#1d2d27] text-white hover:bg-[#263b33]"
            disabled={!newMember.trim()}
            aria-label="Ajouter ce participant"
          >
            <Plus className="size-4" />
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Partager et sauvegarder</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-20 flex-col items-start rounded-2xl bg-white/65 p-3 text-left"
            onClick={() => void shareSummary()}
          >
            <Share2 className="size-4 text-[#a54835]" />
            <span className="mt-2 w-full text-xs font-semibold">Partager le récap</span>
            <span className="w-full text-[10px] font-normal text-muted-foreground">WeChat ou autre</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-20 flex-col items-start rounded-2xl bg-white/65 p-3 text-left"
            onClick={exportGroup}
          >
            <Download className="size-4 text-[#a54835]" />
            <span className="mt-2 w-full text-xs font-semibold">Exporter les données</span>
            <span className="w-full text-[10px] font-normal text-muted-foreground">Fichier JSON local</span>
          </Button>
        </div>
        <div className="mt-3 flex gap-3 rounded-2xl bg-[#edf5ef] p-3 text-[#315943]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p className="text-[11px] leading-5">
            Tes données restent dans ce navigateur. L’export sert de sauvegarde et le récap peut être partagé sans compte.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Réglages du groupe</h2>
        <div className="space-y-2">
          <Label htmlFor="settings-group-name">Nom</Label>
          <div className="flex gap-2">
            <Input
              id="settings-group-name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              className="h-11 rounded-xl bg-white"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl bg-white"
              disabled={!groupName.trim() || groupName.trim() === group.name}
              onClick={() => {
                onRenameGroup(groupName.trim());
                onNotify("Nom mis à jour");
              }}
            >
              Enregistrer
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-start rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
          disabled={!canDeleteGroup}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" />
          Supprimer ce groupe
        </Button>
        {!canDeleteGroup ? (
          <p className="text-[11px] text-muted-foreground">
            Crée un autre groupe avant de supprimer le dernier.
          </p>
        ) : null}
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-[26px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {group.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes ses dépenses et tous ses remboursements disparaîtront de ce navigateur. Exporte une sauvegarde si tu veux les conserver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={onDeleteGroup}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
