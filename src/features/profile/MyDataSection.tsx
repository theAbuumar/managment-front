import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { downloadMyData } from '@/api/auth'
import { errorText } from '@/lib/errorMessages'

// Profile → «Мои данные» (Ф12 12.B13, docs/PRIVACY.md): what the system keeps
// about the person, in plain words, and a copy of it as a JSON file.

export function MyDataSection() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const day = new Date().toISOString().slice(0, 10)
      await downloadMyData(t('Мои данные {{day}}.json', { day }))
      toast.success(t('Файл с вашими данными скачан'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось выгрузить данные')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 md:p-5">
      <h2 className="text-sm font-semibold">{t('Мои данные')}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          'Система хранит ваш профиль, способы входа и сеансы (с IP и браузером), вашу работу — задачи, комментарии, отчёты и файлы, уведомления, диалоги с AI и ваши действия в журнале аудита. Вашу работу видят коллеги по пространству в пределах своих прав, телефон и сеансы — только вы. Посторонним данные не передаются.',
        )}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t(
            'Копия всех ваших данных — одним файлом JSON. Выгрузка отмечается в журнале аудита.',
          )}
        </p>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={download}
          disabled={busy}
        >
          <Download size={14} className="mr-1.5" />
          {busy ? t('Готовим файл…') : t('Скачать мои данные')}
        </Button>
      </div>
    </section>
  )
}
