import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { utcText } from '../intel/analysisView';
import type { Part } from '../intel/useEvidence';
import { Button } from '../ui/Button';
import analysis from '../views/analysis/Analysis.module.css';
import { testChannel, type Channel, type ChannelTestResult, type ChannelType } from './triggerApi';
import styles from './Rules.module.css';

/** Props for {@link ChannelsPanel}. */
export interface ChannelsPanelProps {
  api: ForesignalClient | undefined;
  /** The channels (`listChannels`, admin scope). */
  channels: Part<Channel[]>;
  /** The channel types (`listChannelTypes`, admin scope), for their names. */
  types: Part<ChannelType[]>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A test's outcome as one line. */
function testText(result: ChannelTestResult): string {
  const status = result.status ? ` (HTTP ${result.status})` : '';
  const time = result.durationMs !== undefined ? ` in ${result.durationMs} ms` : '';
  return result.success
    ? `Delivered${status}${time}.`
    : `Failed${status}${time}: ${result.error ?? 'no reason given'}.`;
}

/**
 * The delivery channels (030): each with its type, the events and rules it takes, its severity
 * floor, its health, and **Test** (`testChannel`). Listing channels needs the admin scope; without
 * it the backend's answer is shown.
 */
export function ChannelsPanel({ api, channels, types }: ChannelsPanelProps) {
  const [tests, setTests] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string>();
  const typeName = (id: string) =>
    (types.status === 'ready' && types.value.find((type) => type.id === id)?.name) || id;
  const test = async (channel: Channel) => {
    if (!api) return;
    setTesting(channel.id);
    try {
      const result = await testChannel(api, channel.id);
      setTests((current) => ({ ...current, [channel.id]: testText(result) }));
    } catch (error) {
      setTests((current) => ({ ...current, [channel.id]: `Not tested: ${messageOf(error)}` }));
    } finally {
      setTesting(undefined);
    }
  };
  if (channels.status === 'loading') return <p className={analysis.muted}>Loading channels…</p>;
  if (channels.status === 'error')
    return <p className={analysis.muted}>Channels: {channels.message}</p>;
  if (!channels.value.length) return <p className={analysis.muted}>No channels are configured.</p>;
  return (
    <div className={analysis.tableWrap}>
      <table className={analysis.table}>
        <caption className={analysis.visuallyHidden}>Delivery channels</caption>
        <thead>
          <tr>
            <th scope="col">Channel</th>
            <th scope="col">Type</th>
            <th scope="col">Rules</th>
            <th scope="col">Severity</th>
            <th scope="col">Last delivery</th>
            <th scope="col">Test</th>
          </tr>
        </thead>
        <tbody>
          {channels.value.map((channel) => (
            <tr key={channel.id}>
              <td>
                {channel.name}
                {!channel.enabled && <span className={styles.ruleLine}> (disabled)</span>}
              </td>
              <td>{typeName(channel.type)}</td>
              <td>{channel.ruleIds ? `${channel.ruleIds.length} named` : 'All rules'}</td>
              <td>{channel.minSeverity ?? 'info'}</td>
              <td>
                {utcText(channel.lastDeliveryAt)}
                {channel.failedLast24h ? `, ${channel.failedLast24h} failed in 24 h` : ''}
              </td>
              <td>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={testing === channel.id}
                  onClick={() => void test(channel)}
                  aria-label={`Test ${channel.name}`}
                >
                  {testing === channel.id ? 'Testing…' : 'Test'}
                </Button>
                {tests[channel.id] && <div className={styles.ruleLine}>{tests[channel.id]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
