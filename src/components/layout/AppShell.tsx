import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarRail } from '@/features/sidebar/SidebarRail'
import { SidebarPanel } from '@/features/sidebar/SidebarPanel'
import { Topbar } from '@/features/topbar/Topbar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useTranslation } from 'react-i18next'
import { Eye } from 'lucide-react'
import { useReadOnly, useSummarySync } from '@/stores/summaryStore'
import { useRealtimeConnection } from '@/lib/realtime'
import { useNotificationToasts } from '@/features/notifications/useNotificationToasts'
import { useUnreadTitle } from '@/features/notifications/useUnreadTitle'
import { useAiStatusSync } from '@/stores/aiStore'
import { CommandPalette } from '@/features/search/CommandPalette'

function ActivePanel({ className }: { className?: string }) {
  return <SidebarPanel className={className} />
}

export function AppShell() {
  const { t } = useTranslation()
  const readOnly = useReadOnly()
  const [mobileOpen, setMobileOpen] = useState(false)
  // The mobile drawer closes once a link in it has navigated (state adjusted
  // during render, React's pattern for "reset on prop change").
  const { key: locationKey } = useLocation()
  const [drawerKey, setDrawerKey] = useState(locationKey)
  if (drawerKey !== locationKey) {
    setDrawerKey(locationKey)
    setMobileOpen(false)
  }
  useRealtimeConnection()
  useSummarySync()
  useNotificationToasts()
  useUnreadTitle()
  useAiStatusSync()

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-background"
      data-print="page"
    >
      <div className="contents" data-print="hide">
        {/* Keyboard: the first Tab offers to skip the top bar and the sidebar (12.F3). */}
        <a
          href="#content"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-2"
        >
          {t('Перейти к содержимому')}
        </a>
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <CommandPalette />
        {readOnly && (
          <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            <Eye size={13} className="shrink-0" />
            {t(
              'Режим просмотра: у вас роль «Гость» — задачи, отчёты и аналитику можно смотреть, но не менять.',
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden" data-print="page">
        {/* Desktop: icon rail + active panel (hidden when printing a report page) */}
        <SidebarRail className="hidden md:flex print-hidden" />
        <ActivePanel className="hidden md:flex print-hidden" />

        {/* Mobile sheet */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-auto gap-0 p-0">
            <SidebarRail />
            <ActivePanel />
          </SheetContent>
        </Sheet>

        <main
          id="content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-background focus:outline-none"
          data-print="page"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
