import {
  ChartNoAxesCombined,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/i18n";
import { getMessages } from "@/lib/i18n/server";

interface AuthShellProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

export async function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  const messages = await getMessages();
  const copy = messages.auth.shell;
  const highlights = [
    { icon: WalletCards, ...copy.highlights.wallets },
    { icon: ChartNoAxesCombined, ...copy.highlights.overview },
    { icon: UsersRound, ...copy.highlights.groups },
  ] as const;

  return (
    <main className="min-h-[100dvh] bg-[#f3f1e9] text-[#173f35] lg:grid lg:grid-cols-[minmax(380px,0.88fr)_minmax(560px,1.12fr)]">
      <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#173f35] px-10 py-9 text-[#f3f1e9] lg:flex lg:flex-col xl:px-14 xl:py-12">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#c9ff63] focus-visible:ring-offset-4 focus-visible:ring-offset-[#173f35]"
          aria-label={copy.backHome}
        >
          <Image
            src="/assets/fen-logo-mark-v2.png"
            alt=""
            width={52}
            height={52}
            priority
            className="rounded-[17px] object-cover"
          />
          <span>
            <span className="block text-xl font-semibold tracking-[-0.045em]">
              Fēn
            </span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b9c9c2]">
              {copy.tagline}
            </span>
          </span>
        </Link>

        <div className="my-auto max-w-[560px] py-16">
          <h2 className="max-w-[520px] text-[clamp(2.9rem,5vw,5.2rem)] font-semibold leading-[0.94] tracking-[-0.065em]">
            {copy.heroLine}
            <span className="mt-2 block text-[#c9ff63]">{copy.heroAccent}</span>
          </h2>
          <p className="mt-7 max-w-[470px] text-base leading-7 text-[#c8d5cf] xl:text-lg">
            {copy.description}
          </p>

          <div className="mt-12 grid gap-3">
            {highlights.map(({ icon: Icon, title: itemTitle, description: itemDescription }) => (
              <div
                key={itemTitle}
                className="flex items-start gap-4 rounded-[20px] border border-white/10 bg-white/[0.055] p-4"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#c9ff63] text-[#173f35]">
                  <Icon className="size-5" strokeWidth={2.15} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {itemTitle}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[#adbfb7]">
                    {itemDescription}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="relative flex min-h-[100dvh] items-center justify-center px-5 py-6 sm:px-8 sm:py-10 lg:px-12 xl:px-20">
        <LanguageSwitcher className="absolute right-4 top-4 sm:right-6 sm:top-6" />
        <div className="w-full max-w-[520px]">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#77a52a] focus-visible:ring-offset-4 lg:hidden"
            aria-label={copy.backHome}
          >
            <Image
              src="/assets/fen-logo-mark-v2.png"
              alt=""
              width={48}
              height={48}
              priority
              className="rounded-[16px] object-cover"
            />
            <span>
              <span className="block text-lg font-semibold tracking-[-0.04em]">
                Fēn
              </span>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#53675d]">
                {copy.tagline}
              </span>
            </span>
          </Link>

          <div className="rounded-[30px] border border-[#173f35]/10 bg-[#fffdf7] p-6 shadow-[0_24px_70px_rgba(23,63,53,0.10)] sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#5d6f66]">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-[2rem] font-semibold leading-[1.04] tracking-[-0.055em] text-[#173f35] sm:text-[2.45rem]">
              {title}
            </h1>
            <p className="mt-4 max-w-[430px] text-sm leading-6 text-[#64766e] sm:text-[15px]">
              {description}
            </p>

            <div className="mt-8">{children}</div>
          </div>

        </div>
      </section>
    </main>
  );
}
