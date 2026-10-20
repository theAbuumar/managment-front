import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Info, Keyboard, LifeBuoy, ShieldCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { getAbout, type AboutInfo } from '@/api/about'
import { APP_NAME } from '@/lib/constants'
import { dateTime } from '@/lib/dates'
import { paletteShortcut } from '@/features/search/paletteStore'

// «О системе» (Ф13 13.F4, 13.D4): what the system is, which versions run on this
// stand, the user guide, the keyboard shortcuts and whom to contact. The contact
// line is there only when the stand's owner set one (SUPPORT_CONTACT).

const GUIDE_URL = '/docs/user-guide.pdf'

export function AboutPage() {
  const { t } = useTranslation()
  const [about, setAbout] = useState<AboutInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getAbout()
      .then(setAbout)
      .catch(() => setFailed(true))
  }, [])

  const keys: [string, string][] = [
    [paletteShortcut(), t('поиск и быстрые команды')],
    ['/', t('поиск, когда курсор не в поле ввода')],
    ['C', t('создать задачу в открытом проекте или выбрать проект')],
    ['↑ ↓ Enter', t('выбор и переход в поиске')],
    ['Ctrl+Enter', t('отправить комментарий')],
    ['Esc', t('закрыть окно или карточку задачи')],
  ]

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Info size={16} />
        {t('О системе')}
      </div>

      <div className="max-w-3xl space-y-6 px-4 py-6 md:px-8">
        <section>
          <h1 className="text-lg font-semibold">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'Контроль исполнения поручений и задач университета: поручения с контролёром и сроками, сдача отчётов и проверка, напоминания в вебе и Telegram, аналитика исполнительской дисциплины и отчёты для руководства.',
            )}
          </p>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('Версия')}</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('Сайт')}</dt>
            <dd className="tabular-nums">{__APP_VERSION__}</dd>
            <dt className="text-muted-foreground">{t('Сервер (API)')}</dt>
            <dd className="tabular-nums">
              {about ? (
                <>
                  {about.version}
                  {about.commit && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {t('сборка {{commit}}', { commit: about.commit })}
                    </span>
                  )}
                </>
              ) : failed ? (
                <span className="text-muted-foreground">{t('нет ответа')}</span>
              ) : (
                <Skeleton className="h-4 w-24" />
              )}
            </dd>
            {about && (
              <>
                <dt className="text-muted-foreground">{t('Работает с')}</dt>
                <dd>{dateTime(about.started_at)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t('Telegram-бот')}</dt>
            <dd>{t('встроен в сервер')}</dd>
          </dl>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <a
            href={GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
          >
            <BookOpen size={18} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">
                {t('Руководство пользователя')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('PDF: для сотрудника, руководителя и администратора')}
              </span>
            </span>
          </a>
          <Link
            to="/profile"
            className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
          >
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">
                {t('Мои данные')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('Что хранится обо мне, копия данных, сеансы входа')}
              </span>
            </span>
          </Link>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Keyboard size={15} />
            {t('Горячие клавиши')}
          </h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            {keys.map(([key, what]) => (
              <div key={key} className="contents">
                <dt>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-xs">
                    {key}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </section>

        {about?.support && (
          <section className="flex items-start gap-3 rounded-lg border border-border p-4">
            <LifeBuoy size={18} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">{t('Поддержка')}</h2>
              <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                {about.support}
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
