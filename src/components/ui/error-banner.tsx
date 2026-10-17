import { AlertCircle, X } from 'lucide-react'
import { getFriendlyMessage } from '@/lib/errorMessages'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface ApiError {
  code?: string
  message?: string
}

interface ErrorBannerProps {
  error: ApiError | null | undefined
  onDismiss?: () => void
  className?: string
}

export function ErrorBanner({ error, onDismiss, className }: ErrorBannerProps) {
  if (!error) return null

  const message = getFriendlyMessage(error.code)

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('Скрыть ошибку')}
          className="ml-auto shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
