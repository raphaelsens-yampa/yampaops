import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <main
            className="flex-1 flex flex-col p-3 sm:p-4 md:p-6 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] md:pb-6"
          >
            {children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
