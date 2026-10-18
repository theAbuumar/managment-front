import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { retryNow, useConnection } from '@/lib/connection'

/** A blip shorter than this (a request retried at once) shows no banner. */
const SHOW_AFTER_MS = 1200

// "No connection" banner (12.F5): appears when the server stops answering, says
// that reads will repeat and typed text is kept, and offers an immediate retry.
// When the server answers again it disappears with a short confirmation.
export function ConnectionBanner() {
  const { t } = useTranslation()
  const online = useConnection((s) => s.online)
  const since = useConnection((s) => s.since)
  // The outage the banner was shown for (it appears after a short delay).
  const [shownFor, setShownFor] = useState<number | null>(null)

  useEffect(() => {
    if (online) return
    const timer = setTimeout(() => setShownFor(since), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [online, since])

  // A confirmation when an outage long enough to be noticed ends.
  useEffect(
    () =>
      useConnection.subscribe((next, prev) => {
        if (
          next.online &&
          !prev.online &&
          Date.now() - prev.since >= SHOW_AFTER_MS
        )
          toast.success(t('Связь восстановлена'))
      }),
    [t],
  )

  const visible = !online && shownFor === since
  if (!visible) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[100] flex justify-center px-3">
      <div
        role="status"
        aria-live="assertive"
        className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-md dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100"
      >
        <WifiOff size={16} className="shrink-0" />
        <span>
          <span className="font-medium">{t('Нет связи с сервером.')}</span>{' '}
          {t('Повторяем попытку — введённый текст не потеряется.')}
        </span>
        <button
          type="button"
          onClick={retryNow}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
        >
          <RefreshCw size={13} />
          {t('Повторить')}
        </button>
      </div>
    </div>
  )
}
