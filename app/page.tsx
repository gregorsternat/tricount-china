import { FenApp } from "@/components/fen-app";
import { LedgerStoreProvider } from "@/lib/ledger-store";

export default function Home() {
  return (
    <LedgerStoreProvider>
      <FenApp />
    </LedgerStoreProvider>
  );
}
