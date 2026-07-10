import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Shows a small banner when a new deployed version is ready, so the user can
 * refresh on demand instead of the app silently serving the old cached copy.
 */
export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 z-[100] flex items-center gap-3 bg-card border border-primary/50 rounded-lg shadow-2xl px-4 py-3">
      <span className="flex-1 text-sm text-foreground">A new version is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="px-3 py-1.5 rounded-sm bg-primary text-primary-foreground text-sm font-semibold"
      >
        Refresh
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="px-2 py-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
