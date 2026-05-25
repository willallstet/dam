import { ALL_SCOPES, type Scope } from "api-server-api";
import { useState } from "react";

import {
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "../../../../components/modal.js";
import { useCreateApiKey } from "../../api/mutations.js";

interface Props {
  onCreated: (plaintext: string) => void;
  onCancel: () => void;
}

export function CreateApiKeyForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<Scope>>(
    new Set<Scope>(["agents:run"]),
  );
  const createApiKey = useCreateApiKey();

  function toggleScope(scope: Scope) {
    const next = new Set(selectedScopes);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    setSelectedScopes(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || selectedScopes.size === 0) return;
    const result = await createApiKey.mutateAsync({
      name: name.trim(),
      scopes: Array.from(selectedScopes),
      agentIds: "*",
    });
    onCreated(result.plaintext);
  }

  const submitDisabled =
    !name.trim() || selectedScopes.size === 0 || createApiKey.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <h2 className="text-[18px] font-bold">Create API key</h2>
      </DialogHeader>
      <DialogBody>
        <label className="block mb-4">
          <span className="text-[13px] font-semibold block mb-1.5">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI release pipeline"
            autoFocus
            maxLength={100}
            className="w-full px-3 py-2 text-[14px] rounded-lg border-2 border-border-light bg-surface focus:border-accent outline-none"
          />
        </label>

        <div className="mb-4">
          <span className="text-[13px] font-semibold block mb-1.5">Scopes</span>
          <p className="text-[12px] text-text-muted mb-2">
            Pick the narrowest scope that satisfies your use case. An
            exfiltrated key with only <code>agents:run</code> cannot rewrite
            agent configuration.
          </p>
          <div className="space-y-2">
            {ALL_SCOPES.map((scope) => (
              <ScopeOption
                key={scope}
                scope={scope}
                checked={selectedScopes.has(scope)}
                onToggle={() => toggleScope(scope)}
              />
            ))}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-[13px] font-semibold rounded-lg text-text-secondary hover:bg-surface-raised"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {createApiKey.isPending ? "Creating…" : "Create"}
        </button>
      </DialogFooter>
    </form>
  );
}

interface ScopeOptionProps {
  scope: Scope;
  checked: boolean;
  onToggle: () => void;
}

function ScopeOption({ scope, checked, onToggle }: ScopeOptionProps) {
  return (
    <label className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-raised cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1">
        <code className="text-[13px] font-semibold">{scope}</code>
        <span className="text-[12px] text-text-secondary block">
          {scopeDescription(scope)}
        </span>
      </div>
    </label>
  );
}

function scopeDescription(scope: Scope): string {
  switch (scope) {
    case "agents:run":
      return "Sessions, prompts, approvals, pod-files, terminal. Cannot change agent configuration.";
    case "agents:manage":
      return "Agent CRUD, schedules, channels, skills, egress rules, grant linkage.";
    case "connections:manage":
      return "Connections and secrets — global credential lifecycle. Cannot grant them to agents.";
  }
}
