import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { ContactsPage, ExportsPage, ImportsPage, ListsPage } from "./pages/Workspace";
import { DealsWorkspace, PipelinesWorkspace, TasksWorkspace } from "./pages/AdvancedPanels";
import ImportReview from "./pages/ImportReview";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={ContactsPage} />
        <Route path={"/contacts"} component={ContactsPage} />
        <Route path={"/lists"} component={ListsPage} />
        <Route path={"/imports/review"} component={ImportReview} />
        <Route path={"/imports"} component={ImportsPage} />
        <Route path={"/tasks"} component={TasksWorkspace} />
        <Route path={"/deals"} component={DealsWorkspace} />
        <Route path={"/pipelines"} component={PipelinesWorkspace} />
        <Route path={"/exports"} component={ExportsPage} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
