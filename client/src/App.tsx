import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Companies, { CompanyDetail } from "./pages/Companies";
import ContactDetail from "./pages/ContactDetail";
import Leads from "./pages/Leads";
import FollowUps from "./pages/FollowUps";
import Quotes, { QuoteDetail } from "./pages/Quotes";
import NotFound from "./pages/NotFound";
import WorkspacePlaceholder from "./pages/WorkspacePlaceholder";

function WorkspaceRoute({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/"><WorkspaceRoute><Dashboard /></WorkspaceRoute></Route>
      <Route path="/leads/:id"><WorkspaceRoute><ContactDetail /></WorkspaceRoute></Route>
      <Route path="/leads"><WorkspaceRoute><Leads /></WorkspaceRoute></Route>
      <Route path="/companies/:id"><WorkspaceRoute><CompanyDetail /></WorkspaceRoute></Route>
      <Route path="/companies"><WorkspaceRoute><Companies /></WorkspaceRoute></Route>
      <Route path="/follow-ups"><WorkspaceRoute><FollowUps /></WorkspaceRoute></Route>
      <Route path="/quotes/:id"><WorkspaceRoute><QuoteDetail /></WorkspaceRoute></Route>
      <Route path="/quotes"><WorkspaceRoute><Quotes /></WorkspaceRoute></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider><Toaster /><Router /></TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
