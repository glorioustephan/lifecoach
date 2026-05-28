import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";
import { formatRelative } from "~/lib/time";
import { toast } from "~/lib/use-toast";

/**
 * Monarch Money credentials + sync controls. Extracted from
 * routes/settings.tsx (Wave 5.4). Credentials are encrypted at rest by the
 * server (requires LIFECOACH_SECRET_KEY).
 */
export function MonarchConnectionSection(): JSX.Element {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["monarch-settings"],
    queryFn: api.monarchSettings,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.saveMonarchCredentials({
        email: email.trim(),
        password,
        ...(mfaSecret.trim() ? { mfaSecret: mfaSecret.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success("Monarch connected", "Credentials verified and stored.");
      setPassword("");
      setMfaSecret("");
      void qc.invalidateQueries({ queryKey: ["monarch-settings"] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (err: unknown) => {
      toast.error("Could not connect Monarch", err instanceof Error ? err.message : String(err));
    },
  });

  const sync = useMutation({
    mutationFn: api.syncMonarch,
    onSuccess: (r) => {
      if (r.skipped) {
        toast.info("Already syncing", "A sync is already running.");
      } else if (r.result) {
        toast.success(
          "Monarch synced",
          `${r.result.accountsUpserted} accounts · ${r.result.transactionsUpserted} transactions${r.result.transactionsUnlinked > 0 ? ` (${r.result.transactionsUnlinked} unlinked)` : ""} · ${r.result.holdingsSnapshotted} holdings`,
        );
      } else {
        toast.success("Sync complete");
      }
      void qc.invalidateQueries({ queryKey: ["monarch-settings"] });
      void qc.invalidateQueries({ queryKey: ["finances"] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      toast.error("Sync failed", err instanceof Error ? err.message : String(err));
    },
  });

  const hasCreds = settings?.hasCredentials ?? false;
  const canSave = email.trim().length > 0 && password.length > 0 && !save.isPending;
  const input =
    "w-full rounded-md border border-border-subtle bg-bg px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const btn =
    "cursor-pointer rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-fg">Monarch Money</h2>
          <span
            className={cn(
              "text-[11px] uppercase tracking-wide",
              settings?.connected ? "text-success-500" : "text-fg-faint",
            )}
          >
            {settings?.connected ? "connected" : hasCreds ? "needs attention" : "not configured"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-fg-faint">
          Connect your Monarch Money account to sync accounts, transactions, budgets, and holdings.
          Credentials are encrypted at rest (requires <code>LIFECOACH_SECRET_KEY</code>).
        </p>
        {settings?.lastSyncAt && (
          <p className="mt-1 font-mono text-[10px] text-fg-faint">
            Last sync: {formatRelative(settings.lastSyncAt)}
          </p>
        )}
        {settings?.lastError && !settings.connected && (
          <p className="mt-1 text-[11px] text-warning-200">{settings.lastError}</p>
        )}
      </header>
      <div className="space-y-2.5 px-4 py-3">
        <div className="space-y-2">
          <input
            type="email"
            autoComplete="off"
            aria-label="Monarch email"
            placeholder="Monarch email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          <input
            type="password"
            autoComplete="new-password"
            aria-label="Monarch password"
            placeholder={hasCreds ? "Password (••••••, enter to replace)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          <input
            type="password"
            autoComplete="off"
            aria-label="Monarch MFA secret (TOTP key, optional)"
            placeholder="MFA secret (optional, TOTP key)"
            value={mfaSecret}
            onChange={(e) => setMfaSecret(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => save.mutate()} disabled={!canSave} className={btn}>
            {save.isPending ? "Connecting…" : "Save & Connect"}
          </button>
          {hasCreds && (
            <button
              type="button"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className={btn}
            >
              {sync.isPending ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
        {hasCreds && (
          <p className="text-[11px] text-fg-faint">
            Credentials are saved (encrypted). “Sync now” uses the stored login — you don’t need to
            re-enter anything. The fields above are only for updating them.
          </p>
        )}
      </div>
    </section>
  );
}
