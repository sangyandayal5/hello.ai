import { SidebarProvider } from "@/components/ui/sidebar"
import { DashboardNavbar } from "@/modules/dashboard/ui/components/dashboard-navbar"
import { DashboardSidebar } from "@/modules/dashboard/ui/components/dashboard-sidebar"

interface Props {
    children: React.ReactNode
}

const Layout = ({children}: Props) => {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <main className="flex flex-col min-h-svh w-full flex-1 overflow-auto bg-muted">
        <DashboardNavbar />
        {children}
      </main>
    </SidebarProvider>
  )
}

export default Layout