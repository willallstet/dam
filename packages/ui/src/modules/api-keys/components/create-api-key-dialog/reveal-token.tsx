import { Check, Copy } from "lucide-react";
import { useState } from "react";

import {
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "../../../../components/modal.js";

interface Props {
  plaintext: string;
  onClose: () => void;
}

export function RevealToken({ plaintext, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <DialogHeader>
        <h2 className="text-[18px] font-bold">Save this token now</h2>
      </DialogHeader>
      <DialogBody>
        <p className="text-[13px] text-text-secondary mb-4">
          This is the only time the token will be shown. If you lose it,
          revoke this key and create a new one.
        </p>
        <div
          aria-live="polite"
          className="flex items-stretch gap-2 p-3 rounded-lg bg-surface-raised border border-border-light font-mono text-[12px]"
        >
          <code className="flex-1 break-all">{plaintext}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 px-2 py-1 rounded hover:bg-surface text-text-secondary"
            title="Copy to clipboard"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <p className="text-[12px] text-text-muted mt-3">
          Use with the CLI:{" "}
          <code>export DAM_TOKEN={plaintext.slice(0, 16)}…</code>
        </p>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover"
        >
          Done
        </button>
      </DialogFooter>
    </>
  );
}
