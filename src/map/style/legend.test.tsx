import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fixture from './fixtures/overlay-style.json';
import spriteIndex from './fixtures/sprite-index.json';
import { MapLegend } from './legend';
import { parseOverlayStyle, type MapStyle } from './parseStyle';
import { SpriteSheet, type SpriteIndex } from './sprite';
import type { OverlayStyleState } from './useOverlayStyle';

const model = parseOverlayStyle(fixture as unknown as MapStyle);

/**
 * A sprite whose icons render to a recognizable URL (jsdom has no 2D canvas), with fighter-jet
 * scaled down as the live sprite's oversized icons are.
 */
function fakeSprite(): SpriteSheet {
  const sprite = new SpriteSheet(spriteIndex as SpriteIndex, new Uint8Array(0), 0, 1);
  vi.spyOn(sprite, 'iconUrl').mockImplementation((name, paint) =>
    sprite.has(name) ? `data:${name},${paint.color}` : undefined,
  );
  vi.spyOn(sprite, 'displaySize').mockImplementation((name) =>
    name === 'fighter-jet' ? { width: 15, height: 15 } : { width: 21, height: 21 },
  );
  return sprite;
}

const ready = (sprite?: SpriteSheet): OverlayStyleState => ({
  status: 'ready',
  overlay: { model, sprite },
});

/** A kind's row, its compact summary line and its expandable detail. */
function row(container: HTMLElement, kind: string) {
  const item = container.querySelector(`li[data-kind="${kind}"]`) as HTMLElement;
  return {
    item,
    summary: item.querySelector('summary') as HTMLElement,
    detail: within(item).getByTestId('legend-detail'),
  };
}

describe('MapLegend', () => {
  it('shows loading and error states', () => {
    const { rerender } = render(<MapLegend state={{ status: 'loading' }} onClose={() => {}} />);
    expect(screen.getByText('Loading the map style…')).toBeInTheDocument();
    rerender(<MapLegend state={{ status: 'error', error: new Error('x') }} onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The map style did not load.');
  });

  it('renders one compact row per kind: icon, prettified label, severity colors', () => {
    const { container } = render(<MapLegend state={ready(fakeSprite())} onClose={() => {}} />);
    expect(screen.getByTestId('legend-summary')).toHaveTextContent('5 kinds from 6 layers');
    expect(
      [...container.querySelectorAll('li[data-kind] summary')].map((s) => s.textContent),
    ).toEqual(['Aircraft', 'APRS Message', 'APRS Station', 'Aviation Hazard', 'Conflict Event']);
    const conflict = row(container, 'conflict-event');
    const icon = conflict.summary.querySelectorAll('img[data-icon]');
    expect(icon).toHaveLength(1);
    expect(icon[0]).toHaveAttribute('src', 'data:danger,#C92A2A');
    const hazard = row(container, 'aviation-hazard');
    const dots = within(hazard.summary).getByLabelText('Color by severity');
    expect(dots.querySelectorAll('i').length).toBeGreaterThan(1);
  });

  it('keeps sources and zoom notes out of the row, in its tooltip and detail', () => {
    const { container } = render(<MapLegend state={ready(fakeSprite())} onClose={() => {}} />);
    const aircraft = row(container, 'aircraft');
    expect(aircraft.summary).not.toHaveTextContent('adsb.fi');
    expect(aircraft.summary).not.toHaveTextContent('Hexagon');
    expect(aircraft.summary).toHaveAttribute(
      'title',
      'adsb.fi (https://adsb.fi)\nHexagon counts below zoom 7',
    );
    expect(aircraft.detail).toHaveTextContent('Hexagon counts below zoom 7');
    const conflict = row(container, 'conflict-event');
    expect(
      [...conflict.detail.querySelectorAll('img[data-icon]')].map((img) => img.getAttribute('src')),
    ).toEqual(['data:danger,#C92A2A', 'data:danger,#A61E4D']);
    expect(conflict.detail.querySelector('[data-color="#4DABF7"]')).not.toBeNull();
    expect(conflict.detail).toHaveTextContent(/acleddata\.com/);
    expect(row(container, 'aviation-hazard').detail).toHaveTextContent('other');
  });

  it('expands a row from its summary', async () => {
    const { container } = render(<MapLegend state={ready(fakeSprite())} onClose={() => {}} />);
    const { item, summary } = row(container, 'aircraft');
    const details = item.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await userEvent.click(summary);
    expect(details.open).toBe(true);
  });

  it('draws each icon at the sprite’s normalized display size', () => {
    const { container } = render(<MapLegend state={ready(fakeSprite())} onClose={() => {}} />);
    const jet = row(container, 'aircraft').summary.querySelector('img') as HTMLImageElement;
    const danger = row(container, 'conflict-event').summary.querySelector(
      'img',
    ) as HTMLImageElement;
    expect([jet.width, jet.height]).toEqual([15, 15]);
    expect([danger.width, danger.height]).toEqual([21, 21]);
  });

  it('falls back to an empty cell when the sprite is missing and no API client is given', () => {
    const { container } = render(<MapLegend state={ready()} onClose={() => {}} />);
    expect(container.querySelectorAll('img[data-icon]')).toHaveLength(0);
    expect(container.querySelectorAll('li[data-kind]')).toHaveLength(5);
  });

  it('filters and closes', async () => {
    const onClose = vi.fn();
    const { container } = render(<MapLegend state={ready(fakeSprite())} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Filter the legend'), 'aprs');
    expect(container.querySelectorAll('li[data-kind]')).toHaveLength(2);
    await userEvent.clear(screen.getByLabelText('Filter the legend'));
    await userEvent.type(screen.getByLabelText('Filter the legend'), 'zzz');
    expect(screen.getByText('No kinds match “zzz”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close legend' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
