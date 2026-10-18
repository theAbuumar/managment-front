import { useTranslation } from 'react-i18next'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useNotificationPrefs } from '@/stores/notificationPrefsStore'
import { playNotificationSound } from '@/features/notifications/notificationSound'

// How this browser announces new notifications (Ф8 8.F2): chime and the unread
// count in the tab title. Saved on the device at once, no «Сохранить» needed.
export function NotificationPrefsSection() {
  const { t } = useTranslation()
  const { sound, titleCount, setSound, setTitleCount } = useNotificationPrefs()

  return (
    <section className="rounded-lg border border-border p-4 md:p-5">
      <h2 className="text-sm font-semibold">{t('Уведомления в браузере')}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('Настройка действует на этом устройстве.')}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="pref-sound" className="text-sm">
            {t('Звук при новом уведомлении')}
          </label>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => playNotificationSound(true)}
              aria-label={t('Прослушать звук')}
              title={t('Прослушать звук')}
            >
              <Volume2 className="size-4" />
            </Button>
            <Switch
              id="pref-sound"
              checked={sound}
              onCheckedChange={setSound}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="pref-title" className="text-sm">
            {t('Число непрочитанных в заголовке вкладки')}
          </label>
          <Switch
            id="pref-title"
            checked={titleCount}
            onCheckedChange={setTitleCount}
          />
        </div>
      </div>
    </section>
  )
}
