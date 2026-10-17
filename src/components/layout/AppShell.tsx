import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarRail } from '@/features/sidebar/SidebarRail'
import { SidebarPanel } from '@/features/sidebar/SidebarPanel'
import { Topbar } from '@/features/topbar/Topbar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useSummarySync } from '@/stores/summaryStore'

function ActivePanel({ className }: { className?: string }) {
  return <SidebarPanel className={className} />
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  useSummarySync()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background" data-print="page">
      <div className="contents" data-print="hide">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
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

        <main className="flex-1 overflow-y-auto bg-background" data-print="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
