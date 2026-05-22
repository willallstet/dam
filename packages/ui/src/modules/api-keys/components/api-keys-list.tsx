import { KeyRound } from "lucide-react";
import { useState } from "react";

import { useRevokeApiKey } from "../api/mutations.js";
import { useApiKeys } from "../api/queries.js";
import { ApiKeyRow } from "./api-key-row.js";
import { CreateApiKeyDialog } from "./create-api-key-dialog/index.js";

export function ApiKeysList() {
  const { data: keys, isLoading } = useApiKeys();
  const revokeApiKey = useRevokeApiKey();
  const [createOpen, setCreateOpen] = useState(false);

  function handleRevoke(id: string, name: string) {
    if (
      window.confirm(
        `Revoke "${name}"? The key will stop working immediately.`,
      )
    ) {
      revokeApiKey.mutate({ id });
    }
  }

  return (
    <div className="anim-in">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-[18px] font-bold">API Keys</h2>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover"
        >
          Create key
        </button>
      </div>
      <p className="text-[14px] text-text-secondary mb-6">
        Long-lived tokens for headless / CI use. Set <code>DAM_TOKEN</code> to
        the value when calling the CLI. Plaintext is shown once on creation
        and never recoverable.
      </p>

      {isLoading && <p className="text-[13px] text-text-muted">Loading…</p>}

      {!isLoading && keys && keys.length === 0 && (
        <div className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border-light bg-surface">
          <KeyRound size={32} className="text-text-muted" />
          <p className="text-[13px] text-text-secondary">
            No API keys yet. Create one to authenticate the CLI without a
            browser.
          </p>
        </div>
      )}

      {!isLoading && keys && keys.length > 0 && (
        <ul className="space-y-2">
          {keys.map((k) => (
            <ApiKeyRow
              key={k.id}
              apiKey={k}
              onRevoke={handleRevoke}
              revoking={revokeApiKey.isPending}
            />
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateApiKeyDialog onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}
