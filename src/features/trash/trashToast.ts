import { toast } from 'sonner'
import { restoreFromTrash } from '@/api/trash'
import { errorText } from '@/lib/errorMessages'
import { reloadSubscribers } from '@/lib/realtime'
import { t } from '@/i18n'

/**
 * «Задача перемещена в корзину» with «Восстановить» right in the toast (7.F7):
 * a mistaken delete is undone in one click, without opening the trash.
 */
export function toastIssueTrashed(slug: string, issueId: string) {
  toast.success(t('Задача перемещена в корзину'), {
    description: t(
      'Её можно восстановить в разделе «Корзина» в течение 30 дней.',
    ),
    action: {
      label: t('Восстановить'),
      onClick: async () => {
        try {
          const result = await restoreFromTrash(slug, 'issue', issueId)
          // Boards showing the project put it back (they reload on resync).
          reloadSubscribers()
          toast.success(t('Задача {{key}} восстановлена', { key: result.key }))
        } catch (err) {
          toast.error(errorText(err, t('Не удалось восстановить')))
        }
      },
    },
  })
}
