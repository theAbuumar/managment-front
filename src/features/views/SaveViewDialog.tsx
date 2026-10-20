import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  createView,
  type SavedView,
  type ViewFilters,
  type ViewMode,
} from '@/api/views'
import { errorText } from '@/lib/errorMessages'
import { VIEW_LABELS } from './filters'

/**
 * «Сохранить вид» (7.F5): the page's current filters and display mode under a
 * name. Admins may make it shared — then everyone who sees the project has it.
 */
export function SaveViewDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  filters,
  mode,
  chips,
  canShare,
  onSaved,
  defaultName = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** null — a view of the workspace list. */
  projectId: string | null
  filters: ViewFilters
  mode?: ViewMode
  /** What is being saved, in words. */
  chips: string[]
  canShare: boolean
  onSaved: (view: SavedView) => void
  /** Suggested name (the page title). */
  defaultName?: string
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(defaultName)
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const view = await createView(slug, {
        name: name.trim(),
        project_id: projectId,
        filters,
        display: mode ? { view: mode } : {},
        is_shared: canShare && shared,
      })
      toast.success(t('Вид «{{name}}» сохранён', { name: view.name }))
      onSaved(view)
      setName('')
      setShared(false)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить вид')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark size={18} className="text-primary" />
            {t('Сохранить вид')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Фильтры и способ показа откроются одним щелчком из меню «Виды».',
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="view-name" className="text-sm font-medium">
              {t('Название')}
            </label>
            <Input
              id="view-name"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Например: Просроченные поручения ФЭУ')}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mode && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                {VIEW_LABELS[mode]()}
              </span>
            )}
            {chips.length === 0 ? (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {t('Без фильтров')}
              </span>
            ) : (
              chips.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  {c}
                </span>
              ))
            )}
          </div>
          {canShare && (
            <label className="flex items-start gap-3 rounded-md border border-border p-3">
              <Switch
                checked={shared}
                onCheckedChange={setShared}
                aria-label={t('Общий вид')}
              />
              <span className="text-sm">
                <span className="font-medium">{t('Общий вид')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'Виден всем, кто видит проект. Менять его могут только администраторы.',
                  )}
                </span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('Отмена')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? t('Сохраняем…') : t('Сохранить')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
