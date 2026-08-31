import "server-only";

export async function stableEntityId(
  namespace: string,
  ...parts: readonly string[]
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode([namespace, ...parts].join("\u001f")),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${namespace}_${hash.slice(0, 48)}`;
}
