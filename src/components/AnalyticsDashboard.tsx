import React, { useId, useMemo, useState } from "react";
import { useAnalytics } from "../hooks/useAnalytics.js";
import type { RecentPayment, ResourceStat } from "../api/analytics.js";
import { ErrorBanner } from "./ErrorBanner.js";
import { StatusTag, formatPrice, shortAddress } from "./ResourceCard.js";
import { StatCard, formatCount, timeAgo } from "./StatCard.js";
import { safeExternalUrl } from "../utils/safeExternalUrl.js";

interface Props {
  apiKey: string;
}

const earnedOf = (r: ResourceStat) => {
  const n = Number.parseFloat(r.totalEarned);
  return Number.isFinite(n) ? n : 0;
};

export function AnalyticsDashboard({ apiKey }: Props) {
  const { data, loading, error, retry } = useAnalytics(apiKey);

  const sorted = useMemo(() => [...(data?.resources ?? [])].sort((a, b) => earnedOf(b) - earnedOf(a)), [data]);

  if (loading && !data) return <AnalyticsSkeleton />;

  if (error) return <ErrorBanner message={error} onRetry={retry} />;

  if (!data) return null;

  const { summary } = data;

  // Empty state
  if (summary.totalResources === 0)
    return (
      <div className="synapse-empty" aria-live="polite">
        <div className="synapse-empty__icon" aria-hidden="true">
          <svg width="24" height="24" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 15.5 6.5 9l3 3.5 3-6 3 5" />
          </svg>
        </div>
        <p className="synapse-empty__title">No resources yet</p>
        <p className="synapse-empty__body">
          Publish your first resource to start earning USDC directly to your Stellar wallet.
        </p>
      </div>
    );

  const totalEarned = Number.parseFloat(summary.totalEarned) || 0;
  const avgSale = summary.totalSales > 0 ? totalEarned / summary.totalSales : 0;
  const { verified, pending, rejected } = summary.verification;

  return (
    <div className="space-y-6" aria-live="polite" aria-busy={loading}>
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Total earned"
          value={formatPrice(summary.totalEarned)}
          unit={summary.currency}
          tone="accent"
          note="Paid directly to your Stellar wallet"
        />
        <StatCard
          label="Total sales"
          value={formatCount(summary.totalSales)}
          note={
            summary.totalSales > 0
              ? `avg sale ${formatPrice(avgSale.toFixed(2))} ${summary.currency}`
              : `across ${summary.totalResources} resource${summary.totalResources !== 1 ? "s" : ""}`
          }
        />
        <StatCard
          label="Listed resources"
          value={`${formatCount(summary.listedResources)} / ${formatCount(summary.totalResources)}`}
          progress={summary.listedResources / summary.totalResources}
          tone="success"
          note={`${verified} verified · ${pending} pending · ${rejected} rejected`}
        />
      </div>

      {/* Per-resource breakdown */}
      <div className="rounded-xl border border-line bg-surface shadow-sm">
        <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-fg sm:px-5">Earnings by resource</h2>
        <ul role="list" className="divide-y divide-line">
          {sorted.map((r) => (
            <ResourceRow key={r.id} resource={r} share={totalEarned > 0 ? earnedOf(r) / totalEarned : 0} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading analytics…</span>
      <div className="animate-pulse space-y-6" aria-hidden="true">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface-hover" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-surface-hover" />
      </div>
    </div>
  );
}

function ResourceRow({ resource: r, share }: { resource: ResourceStat; share: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pct = Math.round(share * 100);
  const accessUrl = safeExternalUrl(r.accessUrl);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover sm:gap-4 sm:px-5"
      >
        <svg
          className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg">{r.title}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {formatPrice(r.price)} USDC · {r.listed ? "listed" : "unlisted"} · {r.totalSales} sale
            {r.totalSales !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="hidden w-28 items-center gap-2 sm:flex" title={`${pct}% of earnings`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-fg-subtle">{pct}%</span>
        </div>
        <p className="w-24 text-right font-mono text-sm font-semibold tabular-nums text-accent-text">
          {formatPrice(r.totalEarned)}
          <span className="ml-1 font-sans text-xs font-medium text-fg-subtle">USDC</span>
        </p>
      </button>

      <div id={panelId} hidden={!open} className="border-t border-line bg-surface-sunken/50 px-4 pb-4 pt-3 sm:px-5 sm:pl-12">
        <div className="mb-3">
          <StatusTag status={r.verificationStatus} type="verify" />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Resource URL</p>
        {accessUrl ? (
          <a
            href={accessUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate font-mono text-xs text-accent-text hover:underline"
          >
            {r.accessUrl}
          </a>
        ) : (
          <p className="mt-1 block truncate font-mono text-xs text-fg-subtle">{r.accessUrl}</p>
        )}

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-fg-muted">Recent payments</p>
        {r.recentPayments.length > 0 ? (
          <ul className="mt-2 divide-y divide-line">
            {r.recentPayments.map((p, i) => (
              <PaymentRow key={i} payment={p} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-fg-subtle">No payments yet</p>
        )}
      </div>
    </li>
  );
}

function PaymentRow({ payment: p }: { payment: RecentPayment }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="font-mono text-fg-muted" title={p.payerAddress}>
        {shortAddress(p.payerAddress)}
      </span>
      <time className="ml-auto text-fg-subtle" dateTime={p.paidAt} title={new Date(p.paidAt).toLocaleString()}>
        {timeAgo(p.paidAt)}
      </time>
      <span className="w-20 text-right font-mono font-medium tabular-nums text-fg">{formatPrice(p.amount)} USDC</span>
    </li>
  );
}
