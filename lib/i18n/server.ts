import "server-only";

import { cookies } from "next/headers";

import {
  LOCALE_COOKIE,
  resolveLocale,
  type Locale,
} from "./config";
import type { Messages } from "./messages/types";

const messageLoaders: Record<Locale, () => Promise<Messages>> = {
  en: () => import("./messages/en").then((module) => module.enMessages),
  fr: () => import("./messages/fr").then((module) => module.frMessages),
};

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export async function getMessages(locale?: Locale): Promise<Messages> {
  const resolvedLocale = locale ?? (await getLocale());
  return messageLoaders[resolvedLocale]();
}
