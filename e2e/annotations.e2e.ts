import { expect, test } from '@playwright/test';
import type { Annotation } from '../src/annotations/annotationApi';
import { me, ME_ID } from '../src/annotations/testing/annotationFixtures';
import { graphResult, GRAPH_INVESTIGATION_ID, REFS } from '../src/graph/testing/graphFixtures';
import { investigation } from '../src/intel/testing/fixtures';
import { standInTestToken } from './standIns';
import { collectProblems } from './support';

/**
 * Notes on an object (026), in the Analyst Workbench's side panel. Notes need a token, so the page
 * runs with a test token (the app asks for none without one), and the investigation, its graph and
 * the notes are stand-ins; a note added is kept by the stand-in and must come back in the list.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

/** The notes the stand-in backend holds, by object ref. */
const held = new Map<string, Annotation[]>();

/** The outage's envelope offers `createAnnotation`, as the backend's envelope does with a token. */
const annotatable = graphResult.nodes.map((node) =>
  node.ref === REFS.outage
    ? {
        ...node,
        actions: [
          {
            id: 'annotate',
            label: 'Annotate',
            method: 'POST' as const,
            href: `/v1/objects/${encodeURIComponent(node.ref)}/annotations`,
            scope: 'read' as const,
          },
        ],
      }
    : node,
);

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  held.clear();
  await standInTestToken(page);
  await page.route(new RegExp(`/v1/investigations/${GRAPH_INVESTIGATION_ID}(\\?.*)?$`), (route) =>
    route.fulfill({ json: investigation }),
  );
  await page.route(/\/v1\/graph$/, (route) =>
    route.fulfill({ json: { ...graphResult, nodes: annotatable } }),
  );
  await page.route(/\/v1\/me$/, (route) => route.fulfill({ json: me() }));
  await page.route(/\/v1\/principals\/[^/]+$/, (route) =>
    route.fulfill({ json: { id: ME_ID, handle: 'dana.reyes', displayName: 'Dana Reyes' } }),
  );
  await page.route(/\/v1\/objects\/[^/]+\/dossier(\?.*)?$/, (route) => {
    const ref = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3] ?? '');
    const envelope = annotatable.find((node) => node.ref === ref) ?? {
      ref,
      type: 'object',
      title: ref,
    };
    return route.fulfill({
      json: { ref, generatedAt: new Date().toISOString(), envelope, sections: {} },
    });
  });
  await page.route(/\/v1\/objects\/[^/]+\/annotations(\?.*)?$/, async (route) => {
    const ref = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3] ?? '');
    const notes = held.get(ref) ?? [];
    if (route.request().method() === 'GET') return route.fulfill({ json: notes });
    const input = route.request().postDataJSON() as { body: string; private: boolean };
    const now = new Date().toISOString();
    const created: Annotation = {
      id: `01JA8Q00000000000000000N${String(notes.length + 1).padStart(2, '0')}`,
      targetRef: ref,
      kind: 'note',
      body: input.body,
      author: ME_ID,
      private: input.private,
      createdAt: now,
      updatedAt: now,
    };
    held.set(ref, [...notes, created]);
    return route.fulfill({ status: 201, json: created });
  });
});

test('a note added to an object appears in its notes, and again after a reload', async ({
  page,
}) => {
  await page.goto(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`);
  await page.getByRole('combobox', { name: 'Time window' }).selectOption({ label: 'All time' });
  await page.getByRole('tab', { name: 'List View' }).click();
  await page
    .getByTestId('graph-list')
    .getByRole('button', { name: 'Power outage near Santa Rosa' })
    .click();

  const notes = page
    .getByRole('complementary', { name: 'Selected entity' })
    .getByRole('region', { name: 'Analysis Notes' });
  await expect(notes).toContainText('No notes yet.');
  await notes.getByRole('button', { name: 'Add Note' }).click();
  await notes
    .getByRole('textbox', { name: 'New note' })
    .fill('Crews dispatched to the substation.');
  await notes.getByRole('button', { name: 'Save note' }).click();

  const list = notes.getByTestId('annotations');
  await expect(list).toContainText('Crews dispatched to the substation.');
  await expect(list).toContainText('Dana Reyes');
  await expect(list).toContainText('DR');
  expect(held.get(REFS.outage)).toHaveLength(1);

  // Read again from the backend: the note is in the object's annotations.
  await page.reload();
  await page.getByRole('combobox', { name: 'Time window' }).selectOption({ label: 'All time' });
  await page.getByRole('tab', { name: 'List View' }).click();
  await page
    .getByTestId('graph-list')
    .getByRole('button', { name: 'Power outage near Santa Rosa' })
    .click();
  await expect(notes.getByTestId('annotations')).toContainText(
    'Crews dispatched to the substation.',
  );
  // Another object's envelope offers no note action, so none is offered there.
  await page
    .getByTestId('graph-list')
    .getByRole('button', { name: 'Geysers Geothermal Plant' })
    .click();
  await expect(notes.getByRole('button', { name: 'Add Note' })).toHaveCount(0);
  expect(problems).toEqual([]);
});
