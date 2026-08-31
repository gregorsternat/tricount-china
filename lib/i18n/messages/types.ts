import type { enMessages } from "./en";

type DeepString<T> = T extends string
  ? string
  : { readonly [Key in keyof T]: DeepString<T[Key]> };

export type Messages = DeepString<typeof enMessages>;
export type AuthErrorMessages = Messages["auth"]["errors"];
export type AuthErrorMessageKey = keyof AuthErrorMessages;
