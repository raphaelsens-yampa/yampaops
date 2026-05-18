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
import Contacts from "./pages/Contacts";
import Commissions from "./pages/Commissions";
import CommissionSettings from "./pages/CommissionSettings";
import Forecast from "./pages/Forecast";
import UsersPage from "./pages/Users";
import ProfilePage from "./pages/Profile";
import Imports from "./pages/Imports";
import LinkBuilder from "./pages/LinkBuilder";
import ActiveCampaignIntegration from "./pages/ActiveCampaignIntegration";
import StripeIntegration from "./pages/StripeIntegration";
import ChatwootIntegration from "./pages/ChatwootIntegration";
import IntegrationAudit from "./pages/IntegrationAudit";
import Reports from "./pages/Reports";
import StripeConversions from "./pages/StripeConversions";
import LeadJourney from "./pages/LeadJourney";
import TagsSettings from "./pages/TagsSettings";
import ChatwootReports from "./pages/ChatwootReports";
import ChatwootAudit from "./pages/ChatwootAudit";
import ChatwootAuditSettings from "./pages/ChatwootAuditSettings";
import ChatwootAuditReview from "./pages/ChatwootAuditReview";
import ChatwootAuditInsights from "./pages/ChatwootAuditInsights";
import ChatwootAuditGoldenSet from "./pages/ChatwootAuditGoldenSet";
import ChatwootAuditMine from "./pages/ChatwootAuditMine";
import SalesCampaigns from "./pages/SalesCampaigns";
import SalesCampaignDetail from "./pages/SalesCampaignDetail";
import SalesCampaignReports from "./pages/SalesCampaignReports";
import AgentActivity from "./pages/AgentActivity";
import NotFound from "./pages/NotFound";
import { RequireArea } from "./components/AccessDenied";

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

  const isManager = role === "admin" || role === "tatico";

  return (
    <Routes>
      <Route
        path="/"
        element={
          isManager ? (
            <RequireArea area="dashboard"><AdminDashboard /></RequireArea>
          ) : (
            <SellerKanban />
          )
        }
      />
      <Route path="/pipeline" element={<RequireArea area="pipeline"><Pipeline /></RequireArea>} />
      <Route path="/forecast" element={<RequireArea area="forecast"><Forecast /></RequireArea>} />
      <Route path="/goals" element={<RequireArea area="goals"><Goals /></RequireArea>} />
      <Route path="/team" element={<RequireArea area="team"><Team /></RequireArea>} />
      <Route path="/contacts" element={<RequireArea area="contacts"><Contacts /></RequireArea>} />
      <Route path="/commissions" element={<RequireArea area="commissions"><Commissions /></RequireArea>} />
      <Route path="/commissions/settings" element={<RequireArea area="commissions"><CommissionSettings /></RequireArea>} />
      <Route path="/users" element={<RequireArea area="users"><UsersPage /></RequireArea>} />
      <Route path="/imports" element={<RequireArea area="import"><Imports /></RequireArea>} />
      <Route path="/link-builder" element={<LinkBuilder />} />
      <Route path="/integrations/active-campaign" element={<ActiveCampaignIntegration />} />
      <Route path="/integrations/stripe" element={<StripeIntegration />} />
      <Route path="/integrations/chatwoot" element={<ChatwootIntegration />} />
      <Route path="/integrations/audit" element={<IntegrationAudit />} />
      <Route path="/atendimentos" element={<RequireArea area="atendimentos"><ChatwootReports /></RequireArea>} />
      <Route path="/atendimentos/auditoria" element={<RequireArea area="atendimentos"><ChatwootAudit /></RequireArea>} />
      <Route path="/atendimentos/auditoria/configuracoes" element={<ChatwootAuditSettings />} />
      <Route path="/atendimentos/auditoria/revisao" element={<ChatwootAuditReview />} />
      <Route path="/atendimentos/auditoria/insights" element={<ChatwootAuditInsights />} />
      <Route path="/atendimentos/auditoria/golden-set" element={<ChatwootAuditGoldenSet />} />
      <Route path="/atendimentos/auditoria/minhas" element={<ChatwootAuditMine />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/insights/conversions" element={<StripeConversions />} />
      <Route path="/insights/lead-journey" element={<RequireArea area="dashboard"><LeadJourney /></RequireArea>} />
      <Route path="/settings/tags" element={<TagsSettings />} />
      <Route path="/sales-campaigns" element={<SalesCampaigns />} />
      <Route path="/sales-campaigns/reports" element={<SalesCampaignReports />} />
      <Route path="/sales-campaigns/:id" element={<SalesCampaignDetail />} />
      <Route path="/atividade-agentes" element={<AgentActivity />} />
      <Route path="/profile" element={<ProfilePage />} />
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
