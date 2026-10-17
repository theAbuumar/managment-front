import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col justify-center gap-8 bg-background px-4">
      {/* Circle with 404 */}
      <div className="relative mx-auto flex h-64 w-64 flex-shrink-0 items-start justify-center rounded-full border border-border bg-muted sm:h-72 sm:w-72">
        <span className="mt-10 text-xs font-bold uppercase tracking-[0.35em] text-foreground">
          {t('Ошибка')}
        </span>
        <span className="absolute bottom-0 translate-y-1/4 select-none text-[8rem] font-bold leading-none text-muted-foreground sm:text-[9rem]">
          404
        </span>
      </div>

      {/* Text */}
      <div className="mx-auto w-full max-w-md space-y-2 text-center">
        <p className="text-base font-bold text-foreground">{t('Страница не найдена')}</p>
        <p className="text-sm text-muted-foreground">
          {t('Возможно, ссылка устарела, страница удалена или у вас нет к ней доступа.')}
        </p>
      </div>

      {/* Button */}
      <div className="flex justify-center">
        <Button asChild>
          <Link to="/">{t('На главную')}</Link>
        </Button>
      </div>
    </div>
  )
}
