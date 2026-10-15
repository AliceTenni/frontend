import React, { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Toast } from "./components/Toast.js";
import { ResourceGridSkeleton } from "./components/ResourceCardSkeleton.js";
import { ErrorBanner } from "./components/ErrorBanner.js";
import { CatalogStaleBanner } from "./components/CatalogStaleBanner.js";
import { CatalogSearch } from "./components/CatalogSearch.js";
import { ResourceCard, formatPrice, shortAddress, type Resource } from "./components/ResourceCard.js";
import { KeyboardShortcutsHelp, type KeyboardShortcut } from "./components/KeyboardShortcutsHelp.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAsync } from "./hooks/useAsync.js";
import { useCatalog } from "./hooks/useCatalog.js";
import { useDebouncedValue } from "./hooks/useDebouncedValue.js";
import { useWalletConnection } from "./hooks/useWalletConnection.js";
import { useKeyboardShortcuts, type ShortcutMap } from "./hooks/useKeyboardShortcuts.js";
import { fetchRegistryStatus } from "./api/resources.js";
import type { CatalogFilters } from "./api/resources.js";
import { loadLocale } from "./i18n/config.js";
import { STELLAR_NETWORK } from "./lib/config.js";
import { FREIGHTER_INSTALL_URL } from "./lib/freighter.js";

export type { Resource };

const EditPriceModal         = lazy(() => import("./components/EditPriceModal.js").then((m) => ({ default: m.EditPriceModal })));
const TransferOwnershipModal = lazy(() => import("./components/TransferOwnershipModal.js").then((m) => ({ default: m.TransferOwnershipModal })));
const RegisterModal          = lazy(() => import("./components/RegisterModal.js").then((m) => ({ default: m.RegisterModal })));
const ResourcePreviewModal   = lazy(() => import("./components/ResourcePreviewModal.js").then((m) => ({ default: m.ResourcePreviewModal })));
const AnalyticsDashboard     = lazy(() => import("./components/AnalyticsDashboard.js").then((m) => ({ default: m.AnalyticsDashboard })));
const CreatorDashboard       = lazy(() => import("./components/CreatorDashboard.js").then((m) => ({ default: m.CreatorDashboard })));
const Leaderboard            = lazy(() => import("./components/Leaderboard.js").then((m) => ({ default: m.Leaderboard })));
const AgentStatusPage        = lazy(() => import("./components/AgentStatusPage.js").then((m) => ({ default: m.AgentStatusPage })));
const PublishModal           = lazy(() => import("./components/PublishModal.js").then((m) => ({ default: m.PublishModal })));
const PurchasesDashboard     = lazy(() => import("./components/PurchasesDashboard.js").then((m) => ({ default: m.PurchasesDashboard })));
const BuyModal               = lazy(() => import("./components/BuyModal.js").then((m) => ({ default: m.BuyModal })));

/* ─── types ─────────────────────────────────────────────────────────────── */
type ActiveModal =
  | { kind: "editPrice";          resource: Resource }
  | { kind: "transferOwnership";  resource: Resource }
  | { kind: "register";           resource: Resource }
  | { kind: "preview";            resource: Resource }
  | { kind: "buy";                resource: Resource }
  | null;

type Tab = "catalog" | "dashboard" | "analytics" | "leaderboard" | "purchases" | "agent";
type SortKey = "featured" | "price_asc" | "price_desc" | "title";

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
  { value: "featured", labelKey: "catalog.sort_featured" },
  { value: "price_asc", labelKey: "catalog.sort_price_asc" },
  { value: "price_desc", labelKey: "catalog.sort_price_desc" },
  { value: "title", labelKey: "catalog.sort_title" },
];

const priceOf = (r: Resource) => {
  const n = Number.parseFloat(r.price);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

/** Client-side ordering; "featured" keeps the server's order. */
function sortResources(list: Resource[], sort: SortKey): Resource[] {
  if (sort === "featured") return list;
  const sorted = [...list];
  if (sort === "price_asc") sorted.sort((a, b) => priceOf(a) - priceOf(b));
  else if (sort === "price_desc") sorted.sort((a, b) => priceOf(b) - priceOf(a));
  else sorted.sort((a, b) => a.title.localeCompare(b.title));
  return sorted;
}

/* ─── constants ─────────────────────────────────────────────────────────── */
const PUBLISHING_DOCS_URL = "https://docs.synapsvault.app/publishing";

const DEFAULT_FILTERS: CatalogFilters = {
  search: "",
  minPrice: "",
  maxPrice: "",
  verificationStatus: "all",
  resourceType: "all",
};

const MARKETPLACE_TABS: Tab[] = ["catalog", "leaderboard", "purchases", "agent"];
const CREATOR_TABS: Tab[] = ["dashboard", "analytics"];
/** Number-key shortcuts, in display order. Creator tabs only bind when authenticated. */
const TAB_HOTKEYS: Tab[] = [...MARKETPLACE_TABS, ...CREATOR_TABS];

const TAB_LABEL_KEYS: Record<Tab, string> = {
  catalog: "app.tab_catalog", leaderboard: "app.tab_leaderboard", purchases: "app.tab_purchases",
  agent: "app.tab_agent", dashboard: "app.tab_dashboard", analytics: "app.tab_analytics",
};
const TAB_TITLE_KEYS: Record<Tab, string> = {
  catalog: "app.page_catalog", leaderboard: "app.page_leaderboard", purchases: "app.page_purchases",
  agent: "app.page_agent", dashboard: "app.page_dashboard", analytics: "app.page_analytics",
};
const TAB_SHORTCUT_KEYS: Record<Tab, string> = {
  catalog: "shortcuts.go_catalog", leaderboard: "shortcuts.go_leaderboard", purchases: "shortcuts.go_purchases",
  agent: "shortcuts.go_agent", dashboard: "shortcuts.go_dashboard", analytics: "shortcuts.go_analytics",
};

function hasActiveFilters(f: CatalogFilters): boolean {
  return Boolean(
    f.search || f.minPrice || f.maxPrice ||
    (f.verificationStatus && f.verificationStatus !== "all") ||
    (f.resourceType && f.resourceType !== "all"),
  );
}

/* ─── icons ─────────────────────────────────────────────────────────────── */
const iconProps = {
  className: "synapse-nav-item__icon", fill: "none", viewBox: "0 0 18 18",
  stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const, "aria-hidden": true,
};

const NavIcons: Record<Tab, React.ReactNode> = {
  catalog:     <svg {...iconProps}><rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="10" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="10" width="6" height="6" rx="1.5"/><rect x="10" y="10" width="6" height="6" rx="1.5"/></svg>,
  dashboard:   <svg {...iconProps}><path d="M3 7.5 9 3l6 4.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.5Z"/><path d="M7 16v-5h4v5"/></svg>,
  analytics:   <svg {...iconProps}><path d="M2.5 15.5 6.5 9l3 3.5 3-6 3 5"/></svg>,
  purchases:   <svg {...iconProps}><path d="M3 4h12l-1.3 7.5a1 1 0 0 1-1 .8H5.3a1 1 0 0 1-1-.8L3 4Zm0 0-.5-2H1"/><circle cx="6" cy="15" r="1"/><circle cx="12" cy="15" r="1"/></svg>,
  leaderboard: <svg {...iconProps}><path d="M5 16V9M9 16V3M13 16v-5"/></svg>,
  agent:       <svg {...iconProps}><rect x="3" y="5" width="12" height="9" rx="2.5"/><path d="M9 2v3M6.5 9.5h.01M11.5 9.5h.01M7 12h4"/></svg>,
};

/* ─── fallbacks ─────────────────────────────────────────────────────────── */
function LazyFallback({ label }: { label?: string }) {
  return (
    <div className="synapse-lazy-fallback" role="status" aria-live="polite">
      <span className="synapse-spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  );
}

function LazyModalFallback() {
  return (
    <div className="synapse-modal-backdrop" role="status" aria-live="polite">
      <span className="synapse-spinner synapse-spinner--lg" aria-hidden="true" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   App
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeModal, setActiveModal]   = useState<ActiveModal>(null);
  const [toast, setToast]               = useState<{ message: string; fallbackUrl?: string } | null>(null);
  const [filters, setFilters]           = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [overrides, setOverrides]       = useState<Record<string, Partial<Resource>>>({});
  const [tab, setTab]                   = useState<Tab>("catalog");
  const [showPublish, setShowPublish]   = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [sort, setSort]                 = useState<SortKey>("featured");
  /** Last catalog fetched with no filters: drives "N of TOTAL" and the hero stats. */
  const [unfiltered, setUnfiltered]     = useState<Resource[] | null>(null);
  /** id → title for every resource seen, so Purchases can name what was bought. */
  const resourceTitlesRef               = useRef<Record<string, string>>({});
  const searchInputRef                  = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme }          = useTheme();
  const wallet                          = useWalletConnection();
  const { t, i18n }                     = useTranslation();
  /** Session token obtained via wallet-signature login; gates creator features. */
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [signingIn, setSigningIn]       = useState(false);
  const isAuthenticated                 = Boolean(sessionToken);

  /* catalog — debounced so typing doesn't fire a request per keystroke */
  const debouncedFilters = useDebouncedValue(filters, 250);
  const {
    status: resourcesStatus,
    data: rawResources,
    error: resourcesError,
    retry: retryResources,
    stale: catalogStale,
    syncedAt: catalogSyncedAt,
    loadedFilters,
  } = useCatalog<Resource>(debouncedFilters);

  /* registry stats */
  const { data: registryData } = useAsync(() => fetchRegistryStatus(), []);

  const resources = useMemo((): Resource[] => {
    if (!rawResources) return [];
    return rawResources.map((r) => ({ ...r, ...(overrides[r.id] ?? {}) }));
  }, [rawResources, overrides]);

  useEffect(() => {
    if (resourcesStatus !== "success" || !loadedFilters || hasActiveFilters(loadedFilters)) return;
    setUnfiltered(resources);
  }, [resourcesStatus, loadedFilters, resources]);

  useEffect(() => {
    for (const r of resources) resourceTitlesRef.current[r.id] = r.title;
  }, [resources]);

  const sortedResources = useMemo(() => sortResources(resources, sort), [resources, sort]);

  const heroStats = useMemo(() => {
    const list = unfiltered ?? resources;
    const prices = list.map(priceOf).filter(Number.isFinite);
    const lowest = prices.length ? list.find((r) => priceOf(r) === Math.min(...prices))?.price ?? null : null;
    return {
      listings: list.length,
      verified: list.filter((r) => r.verificationStatus === "verified").length,
      lowest,
    };
  }, [unfiltered, resources]);

  const applyOverride = useCallback((id: string, patch: Partial<Resource>) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }, []);

  const closeModal = useCallback(() => setActiveModal(null), []);
  const dismissToast = useCallback(() => setToast(null), []);
  const closeShortcutsHelp = useCallback(() => setShowShortcutsHelp(false), []);

  const handleCopyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: t("catalog.url_copied") });
    } catch {
      setToast({ message: t("catalog.copy_this_url"), fallbackUrl: url });
    }
  }, [t]);

  const handleCopyAddress = useCallback(async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setToast({ message: t("app.address_copied") });
    } catch {
      setToast({ message: t("catalog.copy_this_url"), fallbackUrl: wallet.address });
    }
  }, [wallet.address, t]);

  const toggleLanguage = useCallback(async () => {
    const next = i18n.language === "en" ? "es" : "en";
    await loadLocale(next);
    await i18n.changeLanguage(next);
    document.documentElement.lang = next;
  }, [i18n]);

  const goTo = useCallback((next: Tab) => {
    setTab(next);
    setSidebarOpen(false);
  }, []);

  /* ── Wallet-signature login ──────────────────────────────────────────── */
  const signIn = useCallback(async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      let address = wallet.address;
      if (wallet.status !== "connected" || !address) {
        address = await wallet.connect();
      }
      if (!address) throw new Error(t("app.signin_failed"));
      const message = `Sign in to ${t("app.title")}\nAddress: ${address}\nIssued: ${new Date().toISOString()}`;
      const token = await wallet.signMessage(message);
      if (!token) throw new Error(t("app.signin_failed"));
      setSessionToken(token);
      setToast({ message: t("app.signed_in") });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : t("app.signin_failed") });
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, wallet, t]);

  const signOut = useCallback(() => {
    setSessionToken(null);
    if (tab === "dashboard" || tab === "analytics") setTab("catalog");
  }, [tab]);

  // Keep showing the current results while a refetch is in flight; only show
  // skeletons on the very first load.
  const isRefreshing  = resourcesStatus === "loading" || filters !== debouncedFilters;
  const isFirstLoad   = (resourcesStatus === "idle" || resourcesStatus === "loading") && !rawResources;
  const registryCount = registryData?.resourceCount ?? null;
  const filtersActive = hasActiveFilters(debouncedFilters);

  /* ── Keyboard shortcuts ──────────────────────────────────────────────── */
  const shortcuts = useMemo<ShortcutMap>(() => {
    const map: ShortcutMap = {
      search: {
        key: "/",
        preventDefault: true,
        handler: () => {
          setTab("catalog");
          // Wait a frame so the catalog (and its input) is mounted.
          requestAnimationFrame(() => searchInputRef.current?.focus());
        },
      },
      help: { key: "?", shift: true, handler: () => setShowShortcutsHelp((v) => !v) },
      theme: { key: "t", handler: toggleTheme },
      language: { key: "l", handler: () => void toggleLanguage() },
      escape: {
        key: "Escape",
        allowInInput: true,
        handler: () => {
          if (activeModal) setActiveModal(null);
          else if (showPublish) setShowPublish(false);
          else if (sidebarOpen) setSidebarOpen(false);
        },
      },
    };
    TAB_HOTKEYS.forEach((target, i) => {
      if (!isAuthenticated && CREATOR_TABS.includes(target)) return;
      map[`tab-${target}`] = { key: String(i + 1), handler: () => goTo(target) };
    });
    if (isAuthenticated) map.publish = { key: "p", handler: () => setShowPublish(true) };
    return map;
  }, [activeModal, showPublish, sidebarOpen, toggleTheme, toggleLanguage, goTo, isAuthenticated]);

  // While the help dialog is open it owns the keyboard (it handles Escape).
  useKeyboardShortcuts(shortcuts, !showShortcutsHelp);

  const shortcutHelpItems: KeyboardShortcut[] = useMemo(() => {
    const nav = t("shortcuts.group_navigation");
    const actions = t("shortcuts.group_actions");
    const help = t("shortcuts.group_help");
    return [
      ...TAB_HOTKEYS
        .filter((target) => isAuthenticated || !CREATOR_TABS.includes(target))
        .map((target) => ({ keys: String(TAB_HOTKEYS.indexOf(target) + 1), description: t(TAB_SHORTCUT_KEYS[target]), group: nav })),
      { keys: "/", description: t("shortcuts.search"), group: actions },
      ...(isAuthenticated ? [{ keys: "P", description: t("shortcuts.publish"), group: actions }] : []),
      { keys: "T", description: t("shortcuts.toggle_theme"), group: actions },
      { keys: "L", description: t("shortcuts.toggle_language"), group: actions },
      { keys: "?", description: t("shortcuts.show_shortcuts"), group: help },
      { keys: "Esc", description: t("shortcuts.escape"), group: help },
    ];
  }, [t, isAuthenticated]);

  /* ── Sidebar ─────────────────────────────────────────────────────────── */
  const renderNavItem = (target: Tab) => (
    <button
      key={target}
      className={`synapse-nav-item ${tab === target ? "synapse-nav-item--active" : ""}`}
      aria-current={tab === target ? "page" : undefined}
      onClick={() => goTo(target)}
    >
      {NavIcons[target]}
      <span>{t(TAB_LABEL_KEYS[target])}</span>
      <kbd className="synapse-nav-item__kbd" aria-hidden="true">{TAB_HOTKEYS.indexOf(target) + 1}</kbd>
    </button>
  );

  const renderSidebar = () => (
    <aside id="app-sidebar" className={`synapse-sidebar ${sidebarOpen ? "synapse-sidebar--open" : ""}`}>
      <div className="synapse-sidebar__brand">
        <img src="/icon.svg" alt="" className="synapse-sidebar__logo" width={30} height={30} />
        <span className="synapse-sidebar__name">{t("app.title")}</span>
        <span className="synapse-sidebar__network">{STELLAR_NETWORK}</span>
      </div>

      <nav className="synapse-sidebar__nav" aria-label={t("app.nav_label")}>
        <div className="synapse-nav-label">{t("app.nav_marketplace")}</div>
        {MARKETPLACE_TABS.map(renderNavItem)}

        {isAuthenticated && (
          <div className="synapse-nav-group">
            <div className="synapse-nav-label">{t("app.nav_creator")}</div>
            {CREATOR_TABS.map(renderNavItem)}
            <button className="synapse-nav-item" onClick={() => { setShowPublish(true); setSidebarOpen(false); }}>
              <svg {...iconProps}><path d="M9 3v12M3 9h12"/></svg>
              <span>{t("app.publish_resource")}</span>
            </button>
          </div>
        )}
      </nav>

      <div className="synapse-sidebar__bottom">
        {registryCount !== null && (
          <div className="synapse-registry">
            <span className="synapse-registry__pulse" aria-hidden="true" />
            {t("app.registry_onchain", { count: registryCount })}
          </div>
        )}
        <div className="synapse-sidebar__prefs">
          <button className="synapse-icon-btn" onClick={toggleTheme}
            aria-label={theme === "dark" ? t("app.theme_light") : t("app.theme_dark")}
            title={`${t("shortcuts.toggle_theme")} (T)`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
              {theme === "dark"
                ? <><circle cx="9" cy="9" r="3.5"/><path d="M9 1.5v1.5M9 15v1.5M1.5 9H3M15 9h1.5M3.7 3.7l1 1M13.3 13.3l1 1M14.3 3.7l-1 1M4.7 13.3l-1 1"/></>
                : <path d="M15 10.5A6.5 6.5 0 0 1 7.5 3a6.5 6.5 0 1 0 7.5 7.5Z"/>}
            </svg>
          </button>
          <button className="synapse-icon-btn synapse-icon-btn--text" onClick={() => void toggleLanguage()}
            title={`${t("shortcuts.toggle_language")} (L)`} aria-label={t("language.switch_to")}>
            {i18n.language === "en" ? "ES" : "EN"}
          </button>
          <button className="synapse-icon-btn" onClick={() => setShowShortcutsHelp(true)}
            aria-label={t("shortcuts.open")} title={`${t("shortcuts.open")} (?)`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
              <rect x="1.5" y="4" width="15" height="10" rx="2"/><path d="M4.5 7h.01M7.5 7h.01M10.5 7h.01M13.5 7h.01M5.5 11h7"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );

  /* ── Wallet (top bar) ────────────────────────────────────────────────── */
  const walletBusy = wallet.status === "connecting" || wallet.status === "restoring";
  const renderWallet = () =>
    wallet.status === "connected" && wallet.address ? (
      <div className="synapse-wallet">
        <button className="synapse-wallet-btn" onClick={() => void handleCopyAddress()} title={wallet.address}>
          <span className="synapse-wallet-dot synapse-wallet-dot--connected" aria-hidden="true" />
          <span className="font-mono">{shortAddress(wallet.address)}</span>
          <span className="synapse-sr-only">{t("app.copy_address")}</span>
        </button>
        {isAuthenticated ? (
          <button className="synapse-icon-btn" onClick={signOut}
            aria-label={t("app.sign_out")} title={t("app.sign_out")}>
            <svg width="16" height="16" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12 13l4-4-4-4M16 9H7"/>
            </svg>
          </button>
        ) : (
          <button className="synapse-btn synapse-btn--secondary synapse-btn--sm" onClick={() => void signIn()}
            disabled={signingIn} aria-busy={signingIn || undefined} aria-label={t("app.sign_in")}>
            {signingIn ? <span className="synapse-spinner" aria-hidden="true" /> : null}
            <span className="synapse-topbar__label">{t("app.sign_in")}</span>
          </button>
        )}
        <button className="synapse-icon-btn" onClick={wallet.disconnect}
          aria-label={t("app.disconnect_wallet")} title={t("app.disconnect_wallet")}>
          <svg width="16" height="16" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12 13l4-4-4-4M16 9H7"/>
          </svg>
        </button>
      </div>
    ) : (
      <button
        className="synapse-btn synapse-btn--secondary synapse-btn--sm"
        onClick={() => void wallet.connect()}
        disabled={walletBusy}
        aria-busy={walletBusy || undefined}
        aria-label={t("app.connect_wallet")}
        aria-describedby={wallet.error ? "wallet-error" : undefined}
      >
        {walletBusy ? (
          <span className="synapse-spinner" aria-hidden="true" />
        ) : (
          <svg width="15" height="15" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 5.5V4a1 1 0 0 0-1-1h-9A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15h9a1 1 0 0 0 1-1v-1.5"/>
            <path d="M15.5 6.5h-4a2.5 2.5 0 0 0 0 5h4a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5Z"/><path d="M11.5 9h.01"/>
          </svg>
        )}
        <span className="synapse-topbar__label">
          {wallet.status === "connecting" ? t("app.connecting_wallet") : t("app.connect_wallet")}
        </span>
      </button>
    );

  const renderWalletError = () =>
    wallet.error && (
      <p id="wallet-error" role="alert" className="synapse-wallet-error">
        {wallet.error}
        {/not found/i.test(wallet.error) && (
          <> <a href={FREIGHTER_INSTALL_URL} target="_blank" rel="noopener noreferrer">{t("app.install_freighter")} ↗</a></>
        )}
      </p>
    );

  /* ── Topbar ──────────────────────────────────────────────────────────── */
  const renderTopbar = () => (
    <header className="synapse-topbar">
      <button className="synapse-icon-btn synapse-topbar__menu-btn"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label={t("app.toggle_menu")} aria-expanded={sidebarOpen} aria-controls="app-sidebar">
        <svg width="18" height="18" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
          <path d="M3 5h12M3 9h12M3 13h12"/>
        </svg>
      </button>
      <h1 className="synapse-topbar__title">{t(TAB_TITLE_KEYS[tab])}</h1>
      <div className="synapse-topbar__actions">
        {isAuthenticated && (
          <button className="synapse-btn synapse-btn--primary synapse-btn--sm" onClick={() => setShowPublish(true)}
            aria-label={t("app.publish")}>
            <svg width="14" height="14" fill="none" viewBox="0 0 18 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M9 3v12M3 9h12"/></svg>
            <span className="synapse-topbar__label">{t("app.publish")}</span>
          </button>
        )}
        {renderWallet()}
      </div>
    </header>
  );

  /* ── Catalog tab ─────────────────────────────────────────────────────── */
  const renderCatalogBody = () => {
    if (isFirstLoad) return <ResourceGridSkeleton count={6} />;
    if (resourcesStatus === "error") {
      return <ErrorBanner message={resourcesError ?? t("errors.generic_description")} onRetry={retryResources} />;
    }
    if (resources.length === 0 && resourcesStatus === "success") {
      return filtersActive ? (
        <div className="synapse-empty">
          <div className="synapse-empty__icon" aria-hidden="true">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5"/></svg>
          </div>
          <p className="synapse-empty__title">{t("catalog.no_matches")}</p>
          <button className="synapse-btn synapse-btn--ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
            {t("catalog.clear_filters")}
          </button>
        </div>
      ) : (
        <div className="synapse-empty">
          <div className="synapse-empty__icon" aria-hidden="true">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>
          </div>
          <h2 className="synapse-empty__title">{t("catalog.empty_title")}</h2>
          <p className="synapse-empty__body">{t("catalog.empty_description")}</p>
          <a className="synapse-btn synapse-btn--primary" href={PUBLISHING_DOCS_URL} target="_blank" rel="noopener noreferrer">
            {t("catalog.publish_cta")}
          </a>
        </div>
      );
    }
    return (
      <div className="synapse-resource-grid" aria-busy={isRefreshing}>
        {sortedResources.map((r) => (
          <ResourceCard key={r.id} resource={r}
            onPreview={(res) => setActiveModal({ kind: "preview", resource: res })}
            onBuy={(res) => setActiveModal({ kind: "buy", resource: res })} />
        ))}
      </div>
    );
  };

  const renderCatalog = () => (
    <>
      <section className="synapse-hero" aria-labelledby="hero-title">
        <div className="synapse-hero__copy">
          <p className="synapse-hero__eyebrow">x402 · Stellar · USDC</p>
          <h2 id="hero-title" className="synapse-hero__title">{t("app.hero_title")}</h2>
          <p className="synapse-hero__lead">{t("app.page_catalog_desc")}</p>
        </div>
        {!isFirstLoad && resourcesStatus !== "error" && (
          <dl className="synapse-hero__stats">
            <div className="synapse-hero__stat">
              <dt>{t("app.stat_listings")}</dt>
              <dd>{heroStats.listings}</dd>
            </div>
            <div className="synapse-hero__stat">
              <dt>{t("app.stat_verified")}</dt>
              <dd>{heroStats.verified}</dd>
            </div>
            {registryCount !== null && (
              <div className="synapse-hero__stat">
                <dt>{t("app.stat_onchain")}</dt>
                <dd>{registryCount}</dd>
              </div>
            )}
            {heroStats.lowest !== null && (
              <div className="synapse-hero__stat">
                <dt>{t("app.stat_from")}</dt>
                <dd>{formatPrice(heroStats.lowest)}<small>USDC</small></dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {catalogStale && resourcesStatus === "success" && <CatalogStaleBanner syncedAt={catalogSyncedAt} />}

      <CatalogSearch
        filters={filters}
        total={unfiltered?.length ?? resources.length}
        filtered={resources.length}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        searchInputRef={searchInputRef}
        sortSlot={
          <select
            aria-label={t("catalog.sort_label")}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="synapse-input synapse-select"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        }
      />

      {renderCatalogBody()}
    </>
  );

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="synapse-shell">
      <a href="#main-content" className="synapse-skip-link">{t("app.skip_to_content")}</a>

      {sidebarOpen && <div className="synapse-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      {renderSidebar()}

      <div className="synapse-main">
        {renderTopbar()}

        <main id="main-content" className="synapse-content" tabIndex={-1}>
          {renderWalletError()}
          {/* Keyed by tab: a crash stays inside this screen and resets on navigation. */}
          <ErrorBoundary key={tab} variant="section">
          {tab === "catalog" && renderCatalog()}
          {tab === "leaderboard" && (
            <Suspense fallback={<LazyFallback label={t("app.loading")} />}>
              <Leaderboard />
            </Suspense>
          )}
          {tab === "purchases" && (
            <Suspense fallback={<LazyFallback label={t("app.loading")} />}>
              <PurchasesDashboard initialWallet={wallet.address ?? ""}
                connectedWallet={wallet.status === "connected" ? wallet.address : null}
                resourceTitles={resourceTitlesRef.current} />
            </Suspense>
          )}
          {tab === "agent" && (
            <Suspense fallback={<LazyFallback label={t("app.loading")} />}>
              <AgentStatusPage />
            </Suspense>
          )}
          {tab === "dashboard" && isAuthenticated && (
            <Suspense fallback={<LazyFallback label={t("app.loading")} />}>
              <CreatorDashboard apiKey={sessionToken ?? ""}
                onEditPrice={(r) => setActiveModal({ kind: "editPrice", resource: r as Resource })}
                onTransferOwnership={(r) => setActiveModal({ kind: "transferOwnership", resource: r as Resource })}
                onRegister={(r) => setActiveModal({ kind: "register", resource: r as Resource })} />
            </Suspense>
          )}
          {tab === "analytics" && isAuthenticated && (
            <Suspense fallback={<LazyFallback label={t("app.loading")} />}>
              <AnalyticsDashboard apiKey={sessionToken ?? ""} />
            </Suspense>
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {activeModal?.kind === "preview" && (
        <Suspense fallback={<LazyModalFallback />}>
          <ResourcePreviewModal resourceId={activeModal.resource.id}
            onClose={closeModal} onCopyUrl={handleCopyUrl}
            onBuy={() => setActiveModal({ kind: "buy", resource: activeModal.resource })} />
        </Suspense>
      )}
      {activeModal?.kind === "buy" && (
        <Suspense fallback={<LazyModalFallback />}>
          <BuyModal resourceTitle={activeModal.resource.title} price={activeModal.resource.price}
            recipient={activeModal.resource.walletAddress} accessUrl={activeModal.resource.accessUrl}
            walletAddress={wallet.status === "connected" ? wallet.address : null}
            onConnect={() => void wallet.connect()} connecting={walletBusy} walletError={wallet.error}
            onClose={closeModal} onCopyUrl={handleCopyUrl} />
        </Suspense>
      )}
      {activeModal?.kind === "editPrice" && (
        <Suspense fallback={<LazyModalFallback />}>
          <EditPriceModal resourceId={activeModal.resource.id} currentPrice={activeModal.resource.price}
            apiKey={sessionToken ?? ""} onClose={closeModal}
            onConfirmed={(price) => { applyOverride(activeModal.resource.id, { price }); closeModal(); }} />
        </Suspense>
      )}
      {activeModal?.kind === "transferOwnership" && (
        <Suspense fallback={<LazyModalFallback />}>
          <TransferOwnershipModal resourceId={activeModal.resource.id} apiKey={sessionToken ?? ""}
            onClose={closeModal}
            onConfirmed={(addr) => { applyOverride(activeModal.resource.id, { walletAddress: addr }); closeModal(); }} />
        </Suspense>
      )}
      {activeModal?.kind === "register" && (
        <Suspense fallback={<LazyModalFallback />}>
          <RegisterModal resourceId={activeModal.resource.id} apiKey={sessionToken ?? ""}
            onClose={closeModal}
            onConfirmed={() => { applyOverride(activeModal.resource.id, { onchainStatus: "registered" }); closeModal(); }} />
        </Suspense>
      )}
      {showPublish && isAuthenticated && (
        <Suspense fallback={<LazyModalFallback />}>
          <PublishModal apiKey={sessionToken ?? ""} onClose={() => setShowPublish(false)}
            onPublished={() => retryResources()} />
        </Suspense>
      )}
      <KeyboardShortcutsHelp isOpen={showShortcutsHelp} onClose={closeShortcutsHelp} shortcuts={shortcutHelpItems} />
      {toast && (
        <Toast message={toast.message} fallbackUrl={toast.fallbackUrl} onDismiss={dismissToast} />
      )}
    </div>
  );
}
