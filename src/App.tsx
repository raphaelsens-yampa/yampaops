import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import SellerKanban from "./pages/SellerKanban";
import Goals from "./pages/Goals";
import Pipeline from "./pages/Pipeline";
import Team from "./pages/Team";
import Import from "./pages/Import";
import Forecast from "./pages/Forecast";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-heading font-bold text-sm">Y</span>
          </div>
          <span className="font-heading font-bold text-xl">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!session) return <Auth />;

  if (role === "admin") {
    return (
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/team" element={<Team />} />
        <Route path="/import" element={<Import />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<SellerKanban />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
