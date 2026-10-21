import { me } from '../annotations/testing/annotationFixtures';
import {
  alertActions,
  alertRef,
  alertTitle,
  badgeText,
  canActOnAlerts,
  mostPressing,
  SEVERITY_TONE,
} from './alertView';
import { alert } from './testing/alertFixtures';

const NOW = Date.parse('2026-10-20T13:00:00Z');

describe('the alert view', () => {
  it('names and refers to an alert', () => {
    expect(alertRef(42)).toBe('alert:42');
    expect(alertTitle(alert(1))).toBe('Strong earthquakes near the Gulf');
    expect(alertTitle(alert(1, { ruleName: null }))).toBe('earthquake');
    expect(SEVERITY_TONE.critical).toBe('danger');
  });

  it('lets agent and admin tokens change alerts, not read ones', () => {
    expect(canActOnAlerts(me('read'))).toBe(false);
    expect(canActOnAlerts(me('agent'))).toBe(true);
    expect(canActOnAlerts(me('admin'))).toBe(true);
    expect(canActOnAlerts(undefined)).toBe(false);
  });

  it('offers the actions each state allows', () => {
    expect(alertActions(alert(1), true, NOW)).toEqual({
      ack: true,
      snooze: true,
      unsnooze: false,
      resolve: true,
      feedback: true,
    });
    expect(alertActions(alert(1, { state: 'acknowledged' }), true, NOW)).toMatchObject({
      ack: false,
      resolve: true,
    });
    expect(
      alertActions(alert(1, { snoozedUntil: '2026-10-20T14:00:00Z' }), true, NOW),
    ).toMatchObject({ snooze: false, unsnooze: true });
    expect(alertActions(alert(1, { state: 'resolved' }), true, NOW)).toEqual({
      ack: false,
      snooze: false,
      unsnooze: false,
      resolve: false,
      feedback: true,
    });
    expect(Object.values(alertActions(alert(1), false, NOW)).some(Boolean)).toBe(false);
  });

  it('puts firing before acknowledged, then the most severe, then the newest', () => {
    const picked = mostPressing([
      alert(1, { severity: 'critical', state: 'acknowledged' }),
      alert(2, { severity: 'info' }),
      alert(3, { severity: 'warning' }),
      alert(4, { severity: 'warning' }),
    ]);
    expect(picked?.id).toBe(4);
    expect(mostPressing([])).toBeUndefined();
  });

  it('caps the badge at 99+', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(120)).toBe('99+');
  });
});
