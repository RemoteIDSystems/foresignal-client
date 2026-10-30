import { useSyncExternalStore, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { resolveTheme, ThemeProvider, usePrefersDark } from './theme';
import { setClock } from './format/clock';
import { AccountView } from '../account/AccountView';
import { SecurityView } from '../account/SecurityView';
import { ToastHost } from '../ui/ToastHost';
import {
  AlertsView,
  GlobalDashboard,
  ImageryView,
  MapView,
  OperationsView,
  RfSensorsView,
  SatellitesView,
} from '../views';
import { AnalysisView, IntelligenceHome } from '../views/analysis';
import { WorkbenchView } from '../views/workbench';
import { Activate } from '../auth/Activate';
import { ResetPassword } from '../auth/ResetPassword';
import { SignIn } from '../auth/SignIn';
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
          element={
            <GlobalDashboard
              api={session.api}
              stream={session.stream}
              viewStream={session.viewStream}
              store={session.store}
            />
          }
        />
        <Route
          path="/analyst"
          element={<WorkbenchView api={session.api} store={session.store} />}
        />
        <Route
          path="/analyst/investigations/:id"
          element={<WorkbenchView kind="investigation" api={session.api} store={session.store} />}
        />
        <Route
          path="/analyst/situations/:id"
          element={<WorkbenchView kind="situation" api={session.api} store={session.store} />}
        />
        <Route
          path="/map"
          element={<MapView api={session.api} stream={session.stream} store={session.store} />}
        />
        <Route path="/imagery" element={<ImageryView api={session.api} store={session.store} />} />
        <Route
          path="/satellites"
          element={<SatellitesView api={session.api} store={session.store} />}
        />
        <Route
          path="/rf-sensors"
          element={<RfSensorsView api={session.api} store={session.store} />}
        />
        <Route path="/intelligence" element={<IntelligenceHome api={session.api} />} />
        <Route path="/alerts" element={<AlertsView session={session} />} />
        <Route
          path="/intelligence/situations/:id"
          element={
            <AnalysisView
              kind="situation"
              api={session.api}
              stream={session.stream}
              store={session.store}
            />
          }
        />
        <Route
          path="/intelligence/investigations/:id"
          element={
            <AnalysisView
              kind="investigation"
              api={session.api}
              stream={session.stream}
              store={session.store}
            />
          }
        />
        <Route path="/operations" element={<OperationsView session={session} />} />
        <Route path="/signin" element={<SignIn session={session} />} />
        <Route path="/activate" element={<Activate session={session} />} />
        <Route path="/reset" element={<ResetPassword session={session} />} />
        <Route path="/account" element={<AccountView session={session} />} />
        <Route path="/account/security" element={<SecurityView session={session} />} />
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
  // The signed-in user's preferences (R2-007) choose the theme and the clock for the whole app.
  const preferences = useSyncExternalStore(session.preferences.subscribe, session.preferences.get);
  const prefersDark = usePrefersDark();
  const theme = resolveTheme(preferences?.theme, prefersDark);
  // Apply the chosen zone/locale to the one app clock before the tree renders its timestamps, so a
  // saved change (which re-renders from here) is visible immediately. Idempotent under StrictMode.
  setClock({ timezone: preferences?.timezone ?? null, locale: preferences?.locale ?? null });
  return (
    <ThemeProvider theme={theme}>
      <ToastHost>{router}</ToastHost>
    </ThemeProvider>
  );
}
