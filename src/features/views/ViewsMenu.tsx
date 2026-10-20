import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bookmark,
  BookmarkPlus,
  Check,
  PanelsTopLeft,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getViews,
  type SavedView,
  type ViewFilters,
  type ViewMode,
} from '@/api/views'
import { useMyRole } from '@/stores/summaryStore'
import { FEATURES } from '@/lib/features'
import { isCurrent, viewHref } from './filters'
import { SaveViewDialog } from './SaveViewDialog'

/**
 * «Виды» next to the filters (7.F5): the saved views of this project (or of the
 * workspace list), the one on screen ticked; «Сохранить вид…» stores the current
 * filters; «Все виды» opens the section.
 */
export function ViewsMenu({
  slug,
  projectId,
  filters,
  mode,
  chips,
  defaultName,
}: {
  slug: string
  /** null — the workspace list (/issues). */
  projectId: string | null
  filters: ViewFilters
  mode?: ViewMode
  chips: string[]
  defaultName?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = useMyRole()
  const [views, setViews] = useState<SavedView[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const scope = projectId ?? 'workspace'

  useEffect(() => {
    let cancelled = false
    getViews(slug, scope)
      .then((res) => !cancelled && setViews(res.data))
      .catch(() => !cancelled && setViews([]))
    return () => {
      cancelled = true
    }
  }, [slug, scope])

  if (!FEATURES.views) return null
  const current = views.find((v) =>
    isCurrent(v, filters, projectId ? mode : undefined),
  )
  const guest = role === 'guest'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            title={t('Виды')}
            className="max-w-48"
          >
            <Bookmark
              size={15}
              className={current ? 'fill-primary text-primary' : undefined}
            />
            <span className="hidden truncate sm:inline">
              {current?.name ?? t('Виды')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {views.length === 0 ? (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t('Сохранённых видов пока нет')}
            </DropdownMenuLabel>
          ) : (
            views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => navigate(viewHref(view))}
              >
                {view.id === current?.id ? (
                  <Check size={14} className="text-primary" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="flex-1 truncate">{view.name}</span>
                {view.is_shared && (
                  <Users
                    size={13}
                    className="text-muted-foreground"
                    aria-label={t('Общий вид')}
                  />
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          {!guest && (
            <DropdownMenuItem onClick={() => setSaveOpen(true)}>
              <BookmarkPlus size={14} />
              {t('Сохранить вид…')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              navigate(projectId ? `/projects/${projectId}/views` : '/views')
            }
          >
            <PanelsTopLeft size={14} />
            {t('Все виды')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SaveViewDialog
        // A fresh form on every opening (the suggested name may have changed).
        key={String(saveOpen)}
        defaultName={defaultName}
        open={saveOpen}
        onOpenChange={setSaveOpen}
        slug={slug}
        projectId={projectId}
        filters={filters}
        mode={projectId ? mode : undefined}
        chips={chips}
        canShare={role === 'owner' || role === 'admin'}
        onSaved={(view) =>
          setViews((prev) =>
            [...prev, view].sort(
              (a, b) =>
                Number(b.is_shared) - Number(a.is_shared) ||
                a.name.localeCompare(b.name, 'ru'),
            ),
          )
        }
      />
    </>
  )
}
