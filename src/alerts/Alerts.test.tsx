import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, standInApi } from '../intel/testing/standIn';
import { AlertFeed } from './AlertFeed';
import { AlertStrip } from './AlertStrip';
import { AlertToasts } from './AlertToasts';
import { InboxFeed } from './InboxFeed';
import { NotificationBell } from './NotificationBell';
import { alert, badge, FakeSse, item } from './testing/alertFixtures';

/** An alert feed over a stand-in backend, with a stream the test drives. */
function alertFeed(
  open = [alert(1, { severity: 'critical' }), alert(2, { state: 'acknowledged' })],
) {
  const sse = new FakeSse();
  const stand = standInApi({
    'GET /v1/alerts': () => json({ items: open, nextCursor: null }),
    'POST /v1/alerts/5/ack': () => json(alert(5, { state: 'acknowledged', rev: 9 })),
    'POST /v1/alerts/5/snooze': () =>
      json(alert(5, { snoozedUntil: '2099-01-01T00:00:00Z', rev: 10 })),
    'POST /v1/alerts/1/resolve': () => json(alert(1, { state: 'resolved', rev: 11 })),
    'PUT /v1/alerts/5/feedback': () => json(alert(5, { feedback: 'noise', rev: 12 })),
  });
  const feed = new AlertFeed({
    api: stand.api,
    baseUrl: 'http://api.test',
    getToken: () => 'token',
    transport: sse.transport,
  });
  return { feed, sse, ...stand };
}

describe('alert toasts', () => {
  it('toasts a firing alert, severity-colored, and acknowledges it inline', async () => {
    const { feed, sse, api, asked } = alertFeed([]);
    const onOpen = vi.fn();
    render(<AlertToasts api={api} feed={feed} canAct onOpen={onOpen} />);
    feed.start();
    sse.open();
    sse.send('alert', { type: 'fired', alert: alert(5, { severity: 'critical' }) });
    const toast = await screen.findByTestId('alert-toast');
    expect(toast).toHaveAttribute('role', 'alert');
    expect(toast).toHaveAttribute('data-severity', 'critical');
    expect(toast).toHaveTextContent('Strong earthquakes near the Gulf');
    expect(toast).toHaveTextContent('M5.5 earthquake, 40 km S of Freeport');

    await userEvent.click(within(toast).getByRole('button', { name: /Strong earthquakes/ }));
    expect(onOpen).toHaveBeenCalledWith('alert:5');

    await userEvent.click(within(toast).getByRole('button', { name: 'Ack' }));
    expect(asked).toContain('POST /v1/alerts/5/ack');
    // Acknowledged, it no longer toasts.
    await vi.waitFor(() => expect(screen.queryByTestId('alert-toast')).not.toBeInTheDocument());
  });

  it('snoozes and records feedback, and offers nothing to a read-only token', async () => {
    const { feed, sse, api, asked, bodies } = alertFeed([]);
    const { rerender } = render(<AlertToasts api={api} feed={feed} canAct onOpen={() => {}} />);
    feed.start();
    sse.open();
    sse.send('alert', { type: 'fired', alert: alert(5) });
    const toast = await screen.findByTestId('alert-toast');
    await userEvent.click(within(toast).getByRole('button', { name: 'Snooze 1h' }));
    expect(bodies[asked.indexOf('POST /v1/alerts/5/snooze')]).toEqual({ for: '1h' });
    expect(await within(toast).findByRole('button', { name: 'Unsnooze' })).toBeInTheDocument();
    await userEvent.selectOptions(
      within(toast).getByRole('combobox', { name: 'Feedback' }),
      'noise',
    );
    expect(bodies[asked.indexOf('PUT /v1/alerts/5/feedback')]).toEqual({ feedback: 'noise' });

    rerender(<AlertToasts api={api} feed={feed} canAct={false} onOpen={() => {}} />);
    expect(
      within(screen.getByTestId('alert-toast')).queryByRole('button', { name: 'Ack' }),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }));
    expect(screen.queryByTestId('alert-toast')).not.toBeInTheDocument();
  });
});

describe('the alerts strip', () => {
  it('counts the open alerts, leads with the most pressing, and lists them all', async () => {
    const { feed, api, asked } = alertFeed();
    const onOpen = vi.fn();
    render(<AlertStrip api={api} feed={feed} canAct onOpen={onOpen} />);
    feed.start();
    const strip = await screen.findByTestId('alert-strip');
    expect(strip).toHaveTextContent('1 firing, 1 acknowledged');
    expect(strip).toHaveTextContent('Strong earthquakes near the Gulf: M5.1 earthquake');
    await userEvent.click(within(strip).getByRole('button', { name: 'Show all 2' }));
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(strip).getAllByRole('button', { name: 'Resolve' })[0]!);
    expect(asked).toContain('POST /v1/alerts/1/resolve');
    await vi.waitFor(() =>
      expect(screen.getByTestId('alert-strip')).toHaveAttribute('data-open', '1'),
    );
  });

  it('is not drawn while no alert is open', async () => {
    const { feed, api } = alertFeed([]);
    render(<AlertStrip api={api} feed={feed} canAct onOpen={() => {}} />);
    feed.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('alert-strip')).not.toBeInTheDocument();
  });
});

describe('the notifications bell', () => {
  function inbox(token: string | null = 'token') {
    const sse = new FakeSse();
    const stand = standInApi({
      'GET /v1/notifications/badge': () => json(badge(2, 12, 1)),
      'GET /v1/notifications': () =>
        json({
          items: [item(12, { severity: 'critical' }), item(11), item(10, { read: true })],
          nextCursor: null,
        }),
      'POST /v1/notifications/read': (request) =>
        request
          .clone()
          .json()
          .then((body: { ids?: number[] }) => json(body.ids ? badge(1, 12) : badge(0, 12))),
    });
    const feed = new InboxFeed({
      api: stand.api,
      baseUrl: 'http://api.test',
      getToken: () => token,
      getDeviceId: () => 'device',
      transport: sse.transport,
    });
    return { feed, sse, ...stand };
  }

  it('shows the unread badge, red while a critical one is unread, and lists the inbox', async () => {
    const { feed } = inbox();
    render(<NotificationBell feed={feed} hasToken onOpen={() => {}} />);
    feed.start();
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(bell).toHaveTextContent('2');
    await userEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    const list = await within(panel).findByRole('list', { name: 'Inbox' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Strong earthquakes near the Gulf #12');
    expect(rows[0]).toHaveTextContent('M5.12 earthquake');
    expect(rows[0]).toHaveTextContent('alert · critical · firing · 2026-10-20 12:12Z');
    expect(within(rows[0]!).getByLabelText('Unread')).toBeInTheDocument();
    expect(rows[2]).toHaveAttribute('data-read', 'true');
  });

  it('marks one read and opens its alert, and Mark all read clears the badge', async () => {
    const { feed, asked, bodies } = inbox();
    const onOpen = vi.fn();
    render(<NotificationBell feed={feed} hasToken onOpen={onOpen} />);
    feed.start();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    const list = await screen.findByRole('list', { name: 'Inbox' });
    await userEvent.click(within(list).getAllByRole('button')[1]!);
    expect(onOpen).toHaveBeenCalledWith('alert:11');
    expect(bodies[asked.indexOf('POST /v1/notifications/read')]).toEqual({ ids: [11] });
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
    // Reading never acknowledges: no alert call was made.
    expect(asked.some((line) => line.includes('/v1/alerts/'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    expect(bodies.at(-1)).toEqual({ upToId: 12 });
    expect(await screen.findByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'data-unread',
      '0',
    );
  });

  it('says the inbox needs a token', async () => {
    const { feed } = inbox(null);
    render(<NotificationBell feed={feed} hasToken={false} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(
      screen.getByText('The inbox needs an access token. Add one in Settings.'),
    ).toBeInTheDocument();
  });
});
