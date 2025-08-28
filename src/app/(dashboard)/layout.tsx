import { SidebarProvider } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/modules/dashboard/ui/components/dashboard-sidebar"

interface Props {
    children: React.ReactNode
}

const Layout = ({children}: Props) => {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <main className="flex flex-col min-h-svh w-full flex-1 overflow-auto bg-muted">
        {children}
      </main>
    </SidebarProvider>
  )
}

export default Layout