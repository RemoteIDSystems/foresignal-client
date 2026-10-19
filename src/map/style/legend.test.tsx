import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fixture from './fixtures/overlay-style.json';
import spriteIndex from './fixtures/sprite-index.json';
import { MapLegend } from './legend';
import { parseOverlayStyle, type MapStyle } from './parseStyle';
import { SpriteSheet, type SpriteIndex } from './sprite';
import type { OverlayStyleState } from './useOverlayStyle';

const model = parseOverlayStyle(fixture as unknown as MapStyle);

/** A sprite whose icons render to a recognizable URL (jsdom has no 2D canvas). */
function fakeSprite(): SpriteSheet {
  const sprite = new SpriteSheet(spriteIndex as SpriteIndex, new Uint8Array(0), 0, 2);
  vi.spyOn(sprite, 'iconUrl').mockImplementation((name, paint) =>
    sprite.has(name) ? `data:${name},${paint.color}` : undefined,
  );
  return sprite;
}

const ready = (sprite?: SpriteSheet): OverlayStyleState => ({
  status: 'ready',
  overlay: { model, sprite },
});

describe('MapLegend', () => {
  it('shows loading and error states', () => {
    const { rerender } = render(<MapLegend state={{ status: 'loading' }} onClose={() => {}} />);
    expect(screen.getByText('Loading the map style…')).toBeInTheDocument();
    rerender(<MapLegend state={{ status: 'error', error: new Error('x') }} onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The map style did not load.');
  });

  it('renders a row per kind from the style model, with sprite icons in the style colors', () => {
    const { container } = render(<MapLegend state={ready(fakeSprite())} onClose={() => {}} />);
    expect(screen.getByTestId('legend-summary')).toHaveTextContent('5 kinds from 6 layers');
    const rows = [...container.querySelectorAll('li[data-kind]')];
    expect(rows.map((row) => row.getAttribute('data-kind'))).toEqual([
      'aircraft',
      'aprs-message',
      'aprs-station',
      'aviation-hazard',
      'conflict-event',
    ]);
    const conflict = container.querySelector('li[data-kind="conflict-event"]') as HTMLElement;
    const icons = [...conflict.querySelectorAll('img[data-icon]')];
    expect(icons.map((img) => [img.getAttribute('data-icon'), img.getAttribute('src')])).toEqual([
      ['danger', 'data:danger,#C92A2A'],
      ['danger', 'data:danger,#A61E4D'],
    ]);
    expect(conflict.querySelector('[data-color="#4DABF7"]')).not.toBeNull();
    expect(within(conflict).getByText(/acleddata\.com/)).toBeInTheDocument();
    const aircraft = container.querySelector('li[data-kind="aircraft"]') as HTMLElement;
    expect(aircraft).toHaveTextContent('Hexagon counts below zoom 7');
    const hazard = container.querySelector('li[data-kind="aviation-hazard"]') as HTMLElement;
    expect(within(hazard).getByLabelText('Color by severity')).toHaveTextContent('other');
  });

  it('falls back to a placeholder when the sprite is missing and no API client is given', () => {
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
