import type { ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { ThemeProvider } from './theme';
import { ToastHost } from '../ui/ToastHost';
import {
  AnalystView,
  GlobalDashboard,
  ImageryView,
  IntelligenceView,
  MapView,
  OperationsView,
  RfSensorsView,
  SatellitesView,
} from '../views';
import { AboutView } from './AboutView';
import { AppShell } from './AppShell';
import { DEFAULT_ROUTE } from './routes';
import { SettingsView } from './SettingsView';
import type { Session } from './session';

/** Props for {@link App}. */
export interface AppProps {
  /** The backend session. */
  session: Session;
  /** Start in an in-memory router at this path instead of the browser URL (tests). */
  initialPath?: string;
}

/**
 * Root component: theme, toast host and client-side routing. Every primary tab is a route under
 * the shell; unknown paths and `/` go to the Global dashboard. There are no server routes.
 */
export function App({ session, initialPath }: AppProps) {
  const routes = (
    <Routes>
      <Route element={<AppShell session={session} />}>
        <Route
          path="/global"
          element={<GlobalDashboard api={session.api} stream={session.stream} />}
        />
        <Route path="/analyst" element={<AnalystView />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/imagery" element={<ImageryView />} />
        <Route path="/satellites" element={<SatellitesView />} />
        <Route path="/rf-sensors" element={<RfSensorsView />} />
        <Route path="/intelligence" element={<IntelligenceView />} />
        <Route path="/operations" element={<OperationsView />} />
        <Route path="/settings" element={<SettingsView session={session} />} />
        <Route path="/about" element={<AboutView api={session.api} />} />
        <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      </Route>
    </Routes>
  );
  const router: ReactNode = initialPath ? (
    <MemoryRouter initialEntries={[initialPath]}>{routes}</MemoryRouter>
  ) : (
    <BrowserRouter>{routes}</BrowserRouter>
  );
  return (
    <ThemeProvider>
      <ToastHost>{router}</ToastHost>
    </ThemeProvider>
  );
}
