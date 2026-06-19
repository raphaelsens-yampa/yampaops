import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Auth from "./pages/Auth";
// import AdminDashboard from "./pages/AdminDashboard"; // archived
import SellerKanban from "./pages/SellerKanban";
import Goals from "./pages/Goals";
// import Pipeline from "./pages/Pipeline"; // archived

import Team from "./pages/Team";
// import Contacts from "./pages/Contacts"; // archived
import Commissions from "./pages/Commissions";
import CommissionSettings from "./pages/CommissionSettings";
// import Forecast from "./pages/Forecast"; // archived
import UsersPage from "./pages/Users";
import ProfilePage from "./pages/Profile";
import Imports from "./pages/Imports";
import LinkBuilder from "./pages/LinkBuilder";
// ActiveCampaign integration archived — page kept on disk but not routed.
// import ActiveCampaignIntegration from "./pages/ActiveCampaignIntegration";

import StripeIntegration from "./pages/StripeIntegration";
import ChatwootIntegration from "./pages/ChatwootIntegration";
// import IntegrationAudit from "./pages/IntegrationAudit"; // archived
import Reports from "./pages/Reports";
import StripeConversions from "./pages/StripeConversions";
// import LeadJourney from "./pages/LeadJourney"; // archived (AC-dependent)
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
import DiscountOverview from "./pages/discounts/Overview";
import DiscountPortfolio from "./pages/discounts/Portfolio";
import DiscountRules from "./pages/discounts/Rules";
import Precificacao from "./pages/Precificacao";
import Comissionamento from "./pages/Comissionamento";
import OnePageDiretoria from "./pages/OnePageDiretoria";

import NotFound from "./pages/NotFound";
import { RequireArea } from "./components/AccessDenied";
import { CohortSyncProvider } from "./contexts/CohortSyncContext";
import { GlobalCohortSyncBanner } from "./components/GlobalCohortSyncBanner";

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
            <RequireArea area="one_page_diretoria"><OnePageDiretoria /></RequireArea>
          ) : (
            <SellerKanban />
          )
        }
      />
      {/* Pipeline archived */}
      {/* Forecast archived */}

      <Route path="/goals" element={<RequireArea area="goals"><Goals /></RequireArea>} />
      <Route path="/team" element={<RequireArea area="team"><Team /></RequireArea>} />
      {/* Contatos archived */}
      <Route path="/commissions" element={<RequireArea area="commissions"><Commissions /></RequireArea>} />
      <Route path="/commissions/settings" element={<RequireArea area="commissions"><CommissionSettings /></RequireArea>} />
      <Route path="/users" element={<RequireArea area="users"><UsersPage /></RequireArea>} />
      <Route path="/imports" element={<RequireArea area="import"><Imports /></RequireArea>} />
      <Route path="/link-builder" element={<RequireArea area="link_builder"><LinkBuilder /></RequireArea>} />
      {/* ActiveCampaign integration archived */}
      <Route path="/integrations/stripe" element={<RequireArea area="integration_stripe"><StripeIntegration /></RequireArea>} />
      <Route path="/integrations/chatwoot" element={<RequireArea area="integration_chatwoot"><ChatwootIntegration /></RequireArea>} />
      {/* Integration Audit archived */}
      <Route path="/atendimentos" element={<RequireArea area="atendimentos"><ChatwootReports /></RequireArea>} />
      <Route path="/atendimentos/auditoria" element={<RequireArea area="auditoria_ia"><ChatwootAudit /></RequireArea>} />
      <Route path="/atendimentos/auditoria/configuracoes" element={<RequireArea area="auditoria_ia"><ChatwootAuditSettings /></RequireArea>} />
      <Route path="/atendimentos/auditoria/revisao" element={<RequireArea area="auditoria_ia"><ChatwootAuditReview /></RequireArea>} />
      <Route path="/atendimentos/auditoria/insights" element={<RequireArea area="auditoria_ia"><ChatwootAuditInsights /></RequireArea>} />
      <Route path="/atendimentos/auditoria/golden-set" element={<RequireArea area="auditoria_ia"><ChatwootAuditGoldenSet /></RequireArea>} />
      <Route path="/atendimentos/auditoria/minhas" element={<RequireArea area="auditoria_ia"><ChatwootAuditMine /></RequireArea>} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/insights/conversions" element={<RequireArea area="conversions"><StripeConversions /></RequireArea>} />
      {/* Lead Journey archived (AC-dependent) */}
      <Route path="/settings/tags" element={<RequireArea area="tags"><TagsSettings /></RequireArea>} />
      <Route path="/sales-campaigns" element={<RequireArea area="sales_campaigns"><SalesCampaigns /></RequireArea>} />
      <Route path="/sales-campaigns/reports" element={<RequireArea area="sales_campaigns"><SalesCampaignReports /></RequireArea>} />
      <Route path="/sales-campaigns/:id" element={<RequireArea area="sales_campaigns"><SalesCampaignDetail /></RequireArea>} />
      <Route path="/atividade-agentes" element={<RequireArea area="agent_activity"><AgentActivity /></RequireArea>} />
      <Route path="/discounts/overview" element={<RequireArea area="discounts_overview"><DiscountOverview /></RequireArea>} />
      <Route path="/discounts/portfolio" element={<RequireArea area="discounts_portfolio"><DiscountPortfolio /></RequireArea>} />
      <Route path="/discounts/rules" element={<RequireArea area="discounts_rules"><DiscountRules /></RequireArea>} />
      <Route path="/precificacao" element={<RequireArea area="precificacao"><Precificacao /></RequireArea>} />
      <Route path="/comissionamento" element={<RequireArea area="comissionamento"><Comissionamento /></RequireArea>} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/one-page-diretoria" element={<OnePageDiretoria />} />
      <Route path="/relatorio" element={<OnePageDiretoria />} />
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
            <CohortSyncProvider>
              <AppRoutes />
              <GlobalCohortSyncBanner />
            </CohortSyncProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
