import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RELATE_ACTION } from '../../annotations/testing/annotationFixtures';
import type { ViewGraph } from '../../graph/graphView';
import { node, REFS } from '../../graph/testing/graphFixtures';
import { json, standInApi, type Answer } from '../../intel/testing/standIn';
import { GraphSidePanel } from './GraphSidePanel';

/** A three-node graph whose quake may be related, with one operator and one projected edge. */
function graphWith(actions: (typeof RELATE_ACTION)[]): ViewGraph {
  const envelope = (ref: string, type: string, title: string) => ({
    ref,
    type,
    title,
    seed: false,
    envelope: node(ref, type, title, { actions }),
  });
  return {
    nodes: [
      envelope(REFS.quake, 'record', 'M 4.6 - The Geysers'),
      envelope(REFS.plant, 'facility', 'Geysers Geothermal Plant'),
      envelope(REFS.town, 'place', 'Santa Rosa'),
    ],
    edges: [
      {
        id: '01JA8Q00000000000000000R01',
        from: REFS.quake,
        to: REFS.plant,
        type: 'affects',
        label: 'possible',
        confidence: 1,
        projected: false,
      },
      {
        id: 'rel-near',
        from: REFS.quake,
        to: REFS.town,
        type: 'near',
        label: 'confirmed',
        confidence: 0.9,
        projected: true,
      },
    ],
  };
}

/** The side panel on the quake, over a stand-in backend. */
function renderPanel(actions: (typeof RELATE_ACTION)[], answers: Record<string, Answer> = {}) {
  const stand = standInApi({
    [`GET /v1/objects/${encodeURIComponent(REFS.quake)}/annotations`]: () => json([]),
    ...answers,
  });
  const onGraphChanged = vi.fn();
  render(
    <GraphSidePanel
      api={stand.api}
      graph={graphWith(actions)}
      selected={REFS.quake}
      onSelect={() => undefined}
      onOpen={() => undefined}
      onGraphChanged={onGraphChanged}
    />,
  );
  return { ...stand, onGraphChanged };
}

describe('drawing relations in the workbench', () => {
  it('draws a relation from the selected node to another, and reads the graph again', async () => {
    const { asked, bodies, onGraphChanged } = renderPanel([RELATE_ACTION], {
      'POST /v1/relations': () => json({ id: '01JA8Q00000000000000000R02' }, 201),
    });
    const form = screen.getByRole('form', { name: 'Draw a relation' });
    const draw = within(form).getByRole('button', { name: 'Draw relation' });
    expect(draw).toBeDisabled();
    await userEvent.selectOptions(
      within(form).getByRole('combobox', { name: 'Related object' }),
      'Santa Rosa',
    );
    await userEvent.selectOptions(
      within(form).getByRole('combobox', { name: 'Relation type' }),
      'evidence-for',
    );
    await userEvent.selectOptions(
      within(form).getByRole('combobox', { name: 'Relation label' }),
      'likely',
    );
    await userEvent.click(draw);
    await vi.waitFor(() => expect(onGraphChanged).toHaveBeenCalledTimes(1));
    expect(bodies[asked.indexOf('POST /v1/relations')]).toEqual({
      fromRef: REFS.quake,
      toRef: REFS.town,
      type: 'evidence-for',
      confidence: 1,
      private: false,
      label: 'likely',
    });
    // The node itself is not offered as the other end.
    expect(
      within(form).queryByRole('option', { name: 'M 4.6 - The Geysers' }),
    ).not.toBeInTheDocument();
  });

  it('retires an operator relation, but never a projected one', async () => {
    const { asked, onGraphChanged } = renderPanel([RELATE_ACTION], {
      'DELETE /v1/relations/01JA8Q00000000000000000R01': () => new Response(null, { status: 204 }),
    });
    const evidence = screen.getByTestId('key-evidence');
    expect(within(evidence).getAllByRole('button', { name: 'Retire this relation' })).toHaveLength(
      1,
    );
    await userEvent.click(within(evidence).getByRole('button', { name: 'Retire this relation' }));
    await vi.waitFor(() => expect(onGraphChanged).toHaveBeenCalledTimes(1));
    expect(asked).toContain('DELETE /v1/relations/01JA8Q00000000000000000R01');
  });

  it('says why a relation was not drawn', async () => {
    const { onGraphChanged } = renderPanel([RELATE_ACTION], {
      'POST /v1/relations': () =>
        json({ title: 'Forbidden', status: 403, detail: 'Agent scope is needed.' }, 403),
    });
    const form = screen.getByRole('form', { name: 'Draw a relation' });
    await userEvent.selectOptions(
      within(form).getByRole('combobox', { name: 'Related object' }),
      'Santa Rosa',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Draw relation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent scope is needed.');
    expect(onGraphChanged).not.toHaveBeenCalled();
  });

  it('offers neither drawing nor retiring when the envelope does not', () => {
    renderPanel([]);
    expect(screen.queryByRole('form', { name: 'Draw a relation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retire this relation' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Analysis Notes' })).toBeInTheDocument();
  });
});
