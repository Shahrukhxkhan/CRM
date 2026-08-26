import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { ListsPage } from "./pages/Workspace";
import { DealsWorkspace, ExportsWorkspace, PipelinesWorkspace, TasksWorkspace } from "./pages/AdvancedPanels";
import { ContactsWorkspace } from "./pages/DataManagementPanels";
import { ImportsWorkspace } from "./pages/ImportDataQualityPanel";
import ImportReview from "./pages/ImportReview";
import Home from "./pages/Home";

function DashboardRouter() {
  return <DashboardLayout><Switch>
    <Route path={"/contacts"} component={ContactsWorkspace} />
    <Route path={"/lists"} component={ListsPage} />
    <Route path={"/imports/review"} component={ImportReview} />
    <Route path={"/imports"} component={ImportsWorkspace} />
    <Route path={"/tasks"} component={TasksWorkspace} />
    <Route path={"/deals"} component={DealsWorkspace} />
    <Route path={"/pipelines"} component={PipelinesWorkspace} />
    <Route path={"/exports"} component={ExportsWorkspace} />
    <Route component={NotFound} />
  </Switch></DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path={"/"} component={Home} />
    <Route><DashboardRouter /></Route>
  </Switch>;
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
