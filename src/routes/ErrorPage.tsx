import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError()

  // Route responses carry a status; a thrown Error is a bug in the page — its
  // technical message is kept for the console, the user gets plain text.
  let message = t('Попробуйте обновить страницу. Если ошибка повторится, сообщите администратору.')
  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404
        ? t('Страница не найдена или недоступна.')
        : t('Сервер ответил ошибкой {{status}}.', { status: error.status })
  } else if (error) {
    console.error(error)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlert className="h-12 w-12 text-destructive" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('Что-то пошло не так')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          {t('Обновить')}
        </Button>
        <Button asChild size="sm">
          <Link to="/">{t('На главную')}</Link>
        </Button>
      </div>
    </div>
  )
}
