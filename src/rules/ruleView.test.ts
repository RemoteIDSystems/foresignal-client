import { baselineSeries, channelsForRule, ruleStatus, windowText } from './ruleView';
import { channel, RULE_ID, storedRule } from './testing/ruleFixtures';
import { dryRunName, dryRunRule } from './triggerApi';
import { toRuleInput, draftOf } from './ruleDraft';
import { json, standInApi } from '../intel/testing/standIn';
import { testResult } from './testing/ruleFixtures';

describe('rule view', () => {
  it('draws the first groups of a baseline in slot order', () => {
    const series = baselineSeries({
      ruleId: RULE_ID,
      slotMode: 'hour-of-day',
      bucket: '1h',
      weeksAvailable: 9,
      learning: false,
      slots: [
        { groupKey: 'RU', slot: 2, n: 9, mean: 4, variance: 1, model: 'poisson' },
        { groupKey: 'RU', slot: 1, n: 9, mean: 3, variance: 1, model: 'poisson' },
        { groupKey: '', slot: 0, n: 9, mean: 1, variance: 1, model: 'nb' },
      ],
    });
    expect(series).toEqual([
      {
        name: 'RU',
        points: [
          [1, 3],
          [2, 4],
        ],
      },
      { name: 'All', points: [[0, 1]] },
    ]);
  });

  it('lists the enabled alert channels that name the rule or all rules', () => {
    const rule = storedRule();
    const channels = [
      channel('all', { ruleIds: null }),
      channel('named', { ruleIds: [RULE_ID] }),
      channel('other', { ruleIds: ['someone-else'] }),
      channel('off', { enabled: false }),
      channel('briefings', { events: ['briefing'] }),
    ];
    expect(channelsForRule(channels, rule).map((item) => item.id)).toEqual(['all', 'named']);
  });

  it('says whether a rule is disabled, muted, snoozed or failing', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(
      ruleStatus(
        storedRule({
          enabled: false,
          mutedUntil: '2026-10-20T13:00:00Z',
          snoozedUntil: '2026-10-20T11:00:00Z',
          lastError: 'TRIGGER_PATH_VOLATILE',
        }),
        now,
      ),
    ).toEqual(['disabled', 'muted', 'error']);
    expect(windowText({ states: { active: 1, clear: 2 }, groups: 3 })).toBe(
      '3 groups: 1 active, 2 clear',
    );
    expect(windowText({ states: {}, groups: 1 })).toBe('1 group');
  });
});

describe('dry run', () => {
  it('tests a disabled copy over stored data, simulated, then deletes the copy', async () => {
    const { api, asked, bodies } = standInApi({
      'POST /v1/triggers': () => json(storedRule({ id: 'copy-1', enabled: false }), 201),
      'POST /v1/triggers/copy-1/test': () => json(testResult()),
      'DELETE /v1/triggers/copy-1': () => new Response(null, { status: 204 }),
    });
    const rule = toRuleInput(draftOf(storedRule()), storedRule());
    const result = await dryRunRule(api, rule, { since: '2026-10-19T12:00:00Z' });
    expect(result.wouldFire).toBe(1);
    expect(asked).toEqual([
      'POST /v1/triggers',
      'POST /v1/triggers/copy-1/test?since=2026-10-19T12%3A00%3A00Z&limit=100&simulate=true',
      'DELETE /v1/triggers/copy-1',
    ]);
    expect(bodies[0]).toMatchObject({ name: dryRunName(rule.name), enabled: false });
  });

  it('deletes the copy even when the test fails', async () => {
    const { api, asked } = standInApi({
      'POST /v1/triggers': () => json(storedRule({ id: 'copy-2' }), 201),
      'POST /v1/triggers/copy-2/test': () =>
        json({ title: 'Bad Request', status: 400, detail: 'Range too large' }, 400),
      'DELETE /v1/triggers/copy-2': () => new Response(null, { status: 204 }),
    });
    await expect(
      dryRunRule(api, toRuleInput(draftOf(storedRule())), { since: '2026-10-19T12:00:00Z' }),
    ).rejects.toThrow(/Range too large/);
    expect(asked).toContain('DELETE /v1/triggers/copy-2');
  });
});
