"use client";

import { UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
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

function parseNames(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  );
}

export function CreateGroupDialog({
  onCreate,
  onOpenChange,
}: {
  onCreate: (name: string, participantNames: string[]) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState("Gregor\nLéa\nThomas");
  const [error, setError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const parsedMembers = useMemo(() => parseNames(members), [members]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Donne un nom au groupe.");
      return;
    }
    if (parsedMembers.length < 2) {
      setError("Ajoute au moins deux personnes pour partager les dépenses.");
      return;
    }
    setButtonState("loading");
    onCreate(name.trim(), parsedMembers);
    setButtonState("success");
    window.setTimeout(() => onOpenChange(false), 380);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 top-auto w-full max-w-none translate-x-[-50%] translate-y-0 rounded-b-none rounded-t-[28px] border-white/80 bg-[#fbfaf7] p-6 sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:translate-y-[-50%] sm:rounded-[28px] sm:p-7">
        <DialogHeader className="text-left">
          <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-[#dfece3] text-[#2c5a43]">
            <UsersRound className="size-5" />
          </div>
          <DialogTitle className="text-2xl tracking-[-0.04em]">
            Créer un groupe
          </DialogTitle>
          <DialogDescription>
            Commence avec les prénoms. Tu pourras ajouter d’autres personnes ensuite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="group-name">Nom du groupe</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Week-end à Chengdu"
              className="h-12 rounded-xl bg-white"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="group-members">Participants</Label>
              <span className="text-xs font-medium text-muted-foreground">
                {parsedMembers.length} personne{parsedMembers.length > 1 ? "s" : ""}
              </span>
            </div>
            <Textarea
              id="group-members"
              value={members}
              onChange={(event) => setMembers(event.target.value)}
              placeholder="Un prénom par ligne"
              className="min-h-32 resize-none rounded-xl bg-white leading-7"
            />
            <p className="text-xs text-muted-foreground">
              La première personne sera ton profil dans ce groupe.
            </p>
          </div>

          {error ? (
            <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <StatefulButton
            type="submit"
            state={buttonState}
            loadingText="Création"
            successText="Groupe créé"
            className="h-12 w-full rounded-2xl bg-[#1d2d27] text-white hover:bg-[#263b33]"
          >
            Créer le groupe
          </StatefulButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
