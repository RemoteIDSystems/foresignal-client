import { act, render, screen } from '@testing-library/react';
import { createForesignalClient } from '../../api/client';
import { ChangeStream } from '../../api/stream/ChangeStream';
import type { SseHandlers } from '../../api/stream/sse';
import { LiveBadge } from './LiveBadge';

describe('LiveBadge', () => {
  it('shows the stream’s state: connecting, LIVE once hello arrives, then reconnecting', async () => {
    let handlers!: SseHandlers;
    const stream = new ChangeStream({
      api: createForesignalClient({ baseUrl: 'http://api.test' }),
      baseUrl: '/',
      getToken: () => null,
      transport: (_, given) => {
        handlers = given;
        return () => {};
      },
    });
    render(<LiveBadge stream={stream} />);
    const badge = screen.getByTestId('live-state');
    expect(badge).toHaveTextContent('OFFLINE');
    act(() => stream.start());
    await act(async () => {});
    expect(badge).toHaveTextContent('CONNECTING');
    act(() => {
      handlers.onOpen();
      handlers.onEvent({
        event: 'hello',
        data: JSON.stringify({
          streamId: 'S'.repeat(22),
          topics: ['changes'],
          watermarkSeq: 1023,
          filterVersion: 1,
        }),
      });
    });
    expect(badge).toHaveTextContent('◆ LIVE');
    expect(badge).toHaveAttribute('data-state', 'live');
    expect(badge).toHaveAttribute('data-last-seq', '1023');
    expect(badge).toHaveAttribute('data-filter-version', '1');
    act(() => handlers.onClose({ cause: new TypeError('offline') }));
    expect(badge).toHaveTextContent('RECONNECTING');
    expect(badge.title).toContain('The connection to the server was lost.');
    act(() => stream.stop());
  });

  it('reads OFFLINE with no stream', () => {
    render(<LiveBadge />);
    expect(screen.getByTestId('live-state')).toHaveTextContent('◆ OFFLINE');
  });
});
