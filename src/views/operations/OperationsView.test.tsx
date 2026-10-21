import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { Session } from '../../app/session';
import type { AlertFeedSnapshot } from '../../alerts/AlertFeed';
import { alert } from '../../alerts/testing/alertFixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { OperationsView } from './OperationsView';

/** What the backend answers a request it does not allow without a token. */
const unauthorized = () =>
  json(
    { title: 'Unauthorized', status: 401, detail: 'This endpoint requires a bearer token.' },
    401,
  );

function renderConsole(answers: Record<string, Answer> = {}, token: string | null = null) {
  const stand = standInApi({
    'GET /v1/exports': unauthorized,
    'GET /v1/briefings': () =>
      json([
        {
          id: 'b1',
          name: 'Morning brief',
          enabled: true,
          schedule: '0 6 * * *',
          timezone: 'UTC',
          lastRunStatus: 'succeeded',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ]),
    'GET /v1/briefings/b1/runs': () =>
      json({
        items: [{ id: 'r1', status: 'succeeded', startedAt: '2026-10-20T06:00:00Z' }],
        nextCursor: null,
      }),
    'GET /v1/sources/health': () =>
      json([
        { sourceId: 'usgs-earthquakes', status: 'healthy', consecutiveFailures: 0 },
        {
          sourceId: 'nws-alerts',
          status: 'failing',
          statusReason: 'HTTP 503',
          consecutiveFailures: 4,
        },
        { sourceId: 'abusech-feodo', status: 'disabled', consecutiveFailures: 0 },
      ]),
    'GET /v1/sources/nws-alerts': () =>
      json({
        descriptor: { id: 'nws-alerts', name: 'NWS Alerts', kinds: ['weather-alert'] },
        settings: {},
        health: {
          sourceId: 'nws-alerts',
          status: 'failing',
          consecutiveFailures: 4,
          lastError: 'upstream 503',
        },
      }),
    'GET /v1/channels': unauthorized,
    'GET /v1/sinks': unauthorized,
    'GET /v1/push/devices': unauthorized,
    'GET /v1/sensors': () =>
      json({
        from: '2026-10-20T00:00:00Z',
        to: '2026-10-20T06:00:00Z',
        items: [
          {
            ref: 'sensor:station:satdump-1',
            type: 'sensor',
            title: 'SatDump Houston',
            sensorKind: 'station',
          },
        ],
        note: 'Foresignal cannot task public satellites or third-party sensors',
      }),
    'GET /v1/triggers': () =>
      json([
        {
          id: 'rule-1',
          name: 'Strong quakes',
          type: 'record',
          severity: 'warning',
          enabled: true,
          alertCount: 3,
          lastFiredAt: '2026-10-20T05:00:00Z',
        },
      ]),
    'GET /v1/escalation-policies': unauthorized,
    'GET /v1/analysis/cycles': () =>
      json({
        items: [
          {
            id: '01M58CA5BD50T26AE4SAA69R8M',
            name: 'Daily brief',
            cadence: 'daily',
            schedule: { cron: '0 6 * * *', timezone: 'UTC' },
            enabled: true,
            builtIn: true,
          },
        ],
        nextCursor: null,
      }),
    'GET /v1/chronicles': unauthorized,
    ...answers,
  });
  const snapshot: AlertFeedSnapshot = {
    open: [alert(5, { ruleName: 'Strong quakes', severity: 'critical' })],
    toasts: [],
    stream: 'open',
  };
  const session = {
    api: stand.api,
    store: createStore<AppState>(INITIAL_STATE),
    alerts: { subscribe: () => () => {}, getSnapshot: () => snapshot },
    tokens: { get: () => token, subscribe: () => () => {} },
  } as unknown as Session;
  render(
    <MemoryRouter>
      <OperationsView session={session} />
    </MemoryRouter>,
  );
  return stand;
}

describe('the Operations console', () => {
  it('shows the three sections with the backend’s status, as the backend names it', async () => {
    renderConsole();
    expect(screen.getByRole('heading', { level: 1, name: 'Operations' })).toBeInTheDocument();
    const tasks = screen.getByTestId('ops-tasks');
    const queue = within(tasks).getByRole('region', { name: 'Alert Queue' });
    expect(within(queue).getByRole('listitem', { name: 'Strong quakes' })).toHaveTextContent(
      'critical',
    );
    expect(within(queue).getByText('live')).toBeInTheDocument();
    const runs = within(tasks).getByRole('region', { name: 'Briefing Runs' });
    expect(await within(runs).findByRole('listitem', { name: 'Morning brief' })).toHaveTextContent(
      'succeeded',
    );

    const assets = screen.getByTestId('ops-assets');
    expect(await within(assets).findByTestId('health-counts')).toHaveTextContent('1 failing');
    const board = within(assets).getByRole('region', { name: 'Source Health' });
    expect(
      within(board)
        .getAllByRole('listitem')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['nws-alerts', 'usgs-earthquakes']);
    expect(
      await within(assets).findByRole('listitem', { name: 'SatDump Houston' }),
    ).toHaveTextContent('station');

    const workflows = screen.getByTestId('ops-workflows');
    const rules = within(workflows).getByRole('region', { name: 'Alert Rules' });
    expect(await within(rules).findByRole('listitem', { name: 'Strong quakes' })).toHaveTextContent(
      '3 alerts',
    );
    expect(within(rules).getByRole('link', { name: 'Author rules →' })).toHaveAttribute(
      'href',
      '/alerts?tab=rules',
    );
    expect(
      await within(workflows).findByRole('listitem', { name: 'Daily brief' }),
    ).toHaveTextContent('built-in');
  });

  it('does not ask for the token-only panels without a token, and says one is needed', async () => {
    const { asked } = renderConsole();
    for (const name of [
      'Exports & Packs',
      'Channels',
      'Sinks',
      'Push Devices',
      'Escalation Policies',
      'Chronicles',
    ]) {
      const panel = screen.getByRole('region', { name });
      expect(panel).toHaveTextContent('This needs an access token (Settings).');
      expect(panel).toHaveAttribute('data-state', 'error');
    }
    expect(await screen.findAllByRole('listitem', { name: 'Morning brief' })).not.toHaveLength(0);
    expect(
      asked.filter((call) =>
        /\/v1\/(exports|channels|sinks|push\/devices|escalation-policies|chronicles)\b/.test(call),
      ),
    ).toEqual([]);
  });

  it('says what the backend answered for a panel the token may not read', async () => {
    renderConsole({}, 'fsr_read');
    const channels = screen.getByRole('region', { name: 'Channels' });
    expect(
      await within(channels).findByText('Unauthorized: This endpoint requires a bearer token.'),
    ).toBeInTheDocument();
    expect(channels).toHaveAttribute('data-state', 'error');
  });

  it('opens a source’s detail from the health board, and shows every source on request', async () => {
    renderConsole();
    const board = screen.getByRole('region', { name: 'Source Health' });
    const row = await within(board).findByRole('listitem', { name: 'nws-alerts' });
    await userEvent.click(within(row).getByRole('button', { name: 'nws-alerts' }));
    expect(await within(row).findByTestId('source-facts')).toHaveTextContent('upstream 503');
    await userEvent.selectOptions(
      within(board).getByRole('combobox', { name: 'Show sources' }),
      'all',
    );
    expect(within(board).getAllByRole('listitem', { name: /./ })).toHaveLength(3);
  });

  it('lists a channel’s recent deliveries on request', async () => {
    renderConsole(
      {
        'GET /v1/channels': () =>
          json([{ id: 'c1', name: 'Ops Slack', type: 'slack', enabled: true, events: ['alert'] }]),
        'GET /v1/channels/c1/deliveries': () =>
          json({
            items: [
              { id: 9, event: 'alert', status: 'failed', attempts: 3, lastError: 'HTTP 410' },
            ],
            nextCursor: null,
          }),
      },
      'fsr_read',
    );
    const channels = screen.getByRole('region', { name: 'Channels' });
    const row = await within(channels).findByRole('listitem', { name: 'Ops Slack' });
    await userEvent.click(within(row).getByRole('button', { name: 'Recent deliveries' }));
    expect(await within(row).findByRole('list', { name: 'Recent deliveries' })).toHaveTextContent(
      'failed alert · HTTP 410',
    );
  });
});
