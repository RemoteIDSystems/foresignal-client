import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AlertFeed } from '../../alerts/AlertFeed';
import { FakeSse } from '../../alerts/testing/alertFixtures';
import { me } from '../../annotations/testing/annotationFixtures';
import type { Session } from '../../app/session';
import { situation } from '../../intel/testing/fixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { PushToggle } from '../../push/PushToggle';
import { WebPush, type PushEnvironment } from '../../push/webPush';
import { newDraft, regionScope } from '../../rules/ruleDraft';
import { RuleForm } from '../../rules/RuleForm';
import { RulesList } from '../../rules/RulesList';
import { channel, RULE_ID, storedRule, testResult } from '../../rules/testing/ruleFixtures';
import { createStore, INITIAL_STATE, type AppState } from '../../state/store';
import { AlertsView } from './AlertsView';

const ready = <T,>(value: T) => ({ status: 'ready', value }) as const;

/** A backend that answers the rule operations. */
function rulesBackend(extra: Record<string, Answer> = {}) {
  return standInApi({
    'GET /v1/me': () => json(me('agent')),
    'GET /v1/triggers': () => json([storedRule()]),
    'GET /v1/kinds': () =>
      json([{ kind: 'earthquake', currentCount: 5, sources: ['usgs-earthquakes'] }]),
    'POST /v1/triggers': async (request) => {
      const body = (await request.json()) as { name: string; enabled: boolean };
      return json(storedRule({ ...body, id: body.enabled ? 'saved-1' : 'copy-1' } as never), 201);
    },
    'POST /v1/triggers/copy-1/test': () => json(testResult()),
    'DELETE /v1/triggers/copy-1': () => new Response(null, { status: 204 }),
    ...extra,
  });
}

/** The form for a new rule watching Russia and Poland. */
function renderForm(canWrite = true) {
  const stand = rulesBackend();
  const onSaved = vi.fn();
  render(
    <RuleForm
      api={stand.api}
      initial={newDraft(regionScope(['RU', 'PL'], 'Russia–NATO'), 'Russia–NATO watch')}
      viewport={{ bbox: [10, 20, 30, 40], zoom: 3 }}
      watchlists={ready([])}
      kinds={ready([{ kind: 'earthquake', currentCount: 5, sources: ['usgs-earthquakes'] }])}
      canWrite={canWrite}
      onSaved={onSaved}
      onCancel={() => {}}
    />,
  );
  return { ...stand, onSaved };
}

describe('the rule form', () => {
  it('dry-runs the rule and shows what it would have fired, inline, before saving', async () => {
    const { asked, bodies } = renderForm();
    const user = userEvent.setup();
    expect(screen.getByText('Russia–NATO (RU, PL)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition 1 field' }), 'mag');
    await user.type(screen.getByRole('textbox', { name: 'Condition 1 value' }), '5');
    await user.click(screen.getByRole('button', { name: 'Dry run' }));

    const preview = await screen.findByRole('region', { name: 'Dry run result' });
    expect(within(preview).getByText('Would fire').nextSibling).toHaveTextContent('1');
    expect(within(preview).getByText('Would suppress').nextSibling).toHaveTextContent('1');
    expect(preview).toHaveTextContent('COOLDOWN_APPLIED');
    expect(within(preview).getAllByRole('row')).toHaveLength(3);
    expect(preview).toHaveTextContent('10 km S of Freeport');
    expect(asked[0]).toBe('POST /v1/triggers');
    expect(bodies[0]).toMatchObject({
      enabled: false,
      name: 'Russia–NATO watch (dry run)',
      geofenceRef: { country: ['RU', 'PL'] },
      conditions: [{ path: 'mag', op: '>=', value: 5 }],
    });
    expect(asked[1]).toMatch(/^POST \/v1\/triggers\/copy-1\/test\?since=.*&simulate=true$/);
    expect(asked[2]).toBe('DELETE /v1/triggers/copy-1');
  });

  it('saves the rule enabled', async () => {
    const { asked, bodies, onSaved } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(asked).toEqual(['POST /v1/triggers']);
    expect(bodies[0]).toMatchObject({ name: 'Russia–NATO watch', enabled: true });
  });

  it('says what is missing, and that writing needs the agent scope', async () => {
    renderForm(false);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Name' }));
    expect(screen.getByRole('list', { name: 'Before this rule can be sent' })).toHaveTextContent(
      'Name the rule.',
    );
    expect(screen.getByText(/needs a token with the agent scope/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save rule' })).toBeDisabled();
  });

  it('asks for a window for a windowed type, and drops the record-only mode', async () => {
    renderForm();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'count');
    expect(screen.queryByRole('combobox', { name: 'Mode' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Threshold' })).toHaveValue('5');
    expect(screen.getByRole('textbox', { name: /Window/ })).toHaveValue('1h');
  });
});

describe('the rule list', () => {
  it('mutes, snoozes, disables and deletes a rule, and shows its detail', async () => {
    const changed = vi.fn();
    const { api, asked, bodies } = standInApi({
      [`POST /v1/triggers/${RULE_ID}/mute`]: () => json(storedRule()),
      [`POST /v1/triggers/${RULE_ID}/snooze`]: () => json(storedRule()),
      [`PUT /v1/triggers/${RULE_ID}`]: () => json(storedRule({ enabled: false })),
      [`DELETE /v1/triggers/${RULE_ID}`]: () => new Response(null, { status: 204 }),
      [`GET /v1/triggers/${RULE_ID}/suggestions`]: () =>
        json({
          ruleId: RULE_ID,
          since: '2026-10-13T00:00:00Z',
          suggesterVersion: '1.1.0',
          suggestions: [
            {
              id: 'sg-1',
              ruleId: RULE_ID,
              ruleRev: 'r1',
              status: 'OPEN',
              createdAt: '2026-10-20T00:00:00Z',
              kind: 'raise-threshold',
              rationale: 'Most alerts were marked noise.',
              patch: {},
            },
          ],
        }),
      [`POST /v1/triggers/${RULE_ID}/suggestions/sg-1/apply`]: () => json({}),
      [`GET /v1/triggers/${RULE_ID}/tuning-log`]: () => json({ items: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    render(
      <RulesList
        api={api}
        rules={ready([storedRule()])}
        channels={ready([channel('all', { ruleIds: null })])}
        canWrite
        onEdit={() => {}}
        onChanged={changed}
      />,
    );
    const row = screen.getByRole('listitem', { name: 'Strong earthquakes near the Gulf' });
    expect(row).toHaveTextContent('3 alerts, 1 open');
    // Each change finishes before the next button is free again.
    const press = async (name: string, calls: number) => {
      await user.click(within(row).getByRole('button', { name }));
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(calls));
    };
    await press('Mute 4h', 1);
    await press('Snooze 1h', 2);
    await press('Disable', 3);
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await press('Confirm delete', 4);
    expect(asked).toEqual([
      `POST /v1/triggers/${RULE_ID}/mute`,
      `POST /v1/triggers/${RULE_ID}/snooze`,
      `PUT /v1/triggers/${RULE_ID}`,
      `DELETE /v1/triggers/${RULE_ID}`,
    ]);
    expect(bodies[0]).toEqual({ for: '4h' });
    expect(bodies[1]).toEqual({ for: '1h' });
    expect(bodies[2]).toMatchObject({ enabled: false, name: 'Strong earthquakes near the Gulf' });
    expect(bodies[2]).not.toHaveProperty('id');
    expect(changed).toHaveBeenCalledTimes(4);

    await user.click(within(row).getByRole('button', { name: 'Detail' }));
    const suggestions = await within(row).findByRole('region', { name: 'Tuning suggestions' });
    expect(await within(suggestions).findByText(/Most alerts were marked noise/)).toBeVisible();
    expect(within(row).getByRole('region', { name: 'Delivered by' })).toHaveTextContent(
      'Channel all (slack)',
    );
    await user.click(within(suggestions).getByRole('button', { name: 'Apply' }));
    expect(asked).toContain(`POST /v1/triggers/${RULE_ID}/suggestions/sg-1/apply`);
  });
});

describe('the push toggle', () => {
  it('shows where push stands and turns it on', async () => {
    const env: PushEnvironment = {
      serviceWorker: undefined,
      pushSupported: false,
      permission: () => 'default',
      requestPermission: async () => 'granted',
      storage: undefined,
      scriptUrl: '/sw.js',
      language: 'en',
    };
    const { api } = standInApi({});
    render(<PushToggle push={new WebPush(api, () => 'token', env)} />);
    expect(screen.getByRole('switch', { name: 'Browser notifications for alerts' })).toBeDisabled();
    expect(screen.getByText('Not supported in this browser')).toBeInTheDocument();
  });
});

describe('the Alerts screen', () => {
  it('opens the form watching a situation’s regions from a Create alert link', async () => {
    const stand = rulesBackend({
      [`GET /v1/situations/${situation.id}`]: () => json(situation),
    });
    const sse = new FakeSse();
    const session = {
      api: stand.api,
      store: createStore<AppState>(INITIAL_STATE),
      alerts: new AlertFeed({
        api: stand.api,
        baseUrl: 'http://api.test',
        getToken: () => 'token',
        transport: sse.transport,
      }),
      push: new WebPush(stand.api, () => 'token', {
        serviceWorker: undefined,
        pushSupported: false,
        permission: () => 'default',
        requestPermission: async () => 'denied',
        storage: undefined,
        scriptUrl: '/sw.js',
        language: 'en',
      }),
      tokens: { get: () => 'token', subscribe: () => () => {} },
    } as unknown as Session;
    render(
      <MemoryRouter initialEntries={[`/alerts?new=situation&ref=${situation.id}`]}>
        <Routes>
          <Route path="/alerts" element={<AlertsView session={session} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Alerts' })).toBeInTheDocument();
    const form = await screen.findByRole('form', { name: 'New alert rule' });
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Northern California Seismic Swarm watch',
    );
    expect(within(form).getByText('Northern California Seismic Swarm (US-CA)')).toBeInTheDocument();
    expect(
      await screen.findByRole('listitem', { name: 'Strong earthquakes near the Gulf' }),
    ).toBeInTheDocument();
  });
});
