import { expect, test } from '@playwright/test';
import { graphResult, GRAPH_INVESTIGATION_ID } from '../src/graph/testing/graphFixtures';
import { me } from '../src/annotations/testing/annotationFixtures';
import { investigation, investigationEnvelope } from '../src/intel/testing/fixtures';
import { collectProblems } from './support';

/**
 * The Analyst Workbench's evidence graph (024). The local backend's investigations need a token
 * and its graph has no relations, so the investigation and the subgraph are stand-ins (the 024
 * fixtures); sigma draws them with WebGL in the real browser.
 */

/** Console errors and uncaught exceptions on the page; a check fails if any appear. */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = collectProblems(page);
  await page.route(new RegExp(`/v1/investigations/${GRAPH_INVESTIGATION_ID}(\\?.*)?$`), (route) =>
    route.fulfill({ json: investigation }),
  );
  // The workbench reads the investigation as its full analysis does, with its envelope (019).
  await page.route(/\/v1\/objects\/investigation%3A[^/]+$/, (route) =>
    route.fulfill({ json: investigationEnvelope }),
  );
  await page.route(/\/v1\/graph$/, (route) => route.fulfill({ json: graphResult }));
  // The side panel's notes (026): none, read by a caller with read scope.
  await page.route(/\/v1\/objects\/[^/]+\/annotations(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/v1\/me$/, (route) => route.fulfill({ json: me() }));
  await page.route(/\/v1\/objects\/[^/]+\/dossier(\?.*)?$/, (route) => {
    const ref = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3] ?? '');
    const envelope = graphResult.nodes.find((node) => node.ref === ref) ?? {
      ref,
      type: 'object',
      title: ref,
    };
    return route.fulfill({
      json: { ref, generatedAt: new Date().toISOString(), envelope, sections: {} },
    });
  });
});

test('the evidence graph renders with WebGL, and a node selects', async ({ page }) => {
  await page.goto(`/analyst/investigations/${GRAPH_INVESTIGATION_ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Analyst Workbench');
  await page.getByRole('combobox', { name: 'Time window' }).selectOption({ label: 'All time' });

  const graph = page.getByTestId('relation-graph');
  await expect(graph).toHaveAttribute('data-nodes', '6');
  await expect(graph).toHaveAttribute('data-edges', '5');
  // Sigma's WebGL layers are on the page, sized to the card.
  const nodes = graph.locator('canvas.sigma-nodes');
  await expect(nodes).toBeVisible();
  expect((await nodes.boundingBox())?.height ?? 0).toBeGreaterThan(300);
  await expect(page.getByTestId('graph-legend')).toContainText('evidence-for');
  await expect(page.getByTestId('graph-legend')).toContainText('facility');

  // The mini-map drew the graph's nodes.
  await expect
    .poll(() =>
      page.getByTestId('graph-minimap').evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted++;
        return painted;
      }),
    )
    .toBeGreaterThan(0);

  // A node selects from the list, and the side panel follows it.
  await page.getByRole('tab', { name: 'List View' }).click();
  await page
    .getByTestId('graph-list')
    .getByRole('button', { name: 'Power outage near Santa Rosa' })
    .click();
  const side = page.getByRole('complementary', { name: 'Selected entity' });
  await expect(side.getByRole('heading', { level: 3 })).toHaveText('Power outage near Santa Rosa');
  await expect(side).toContainText('Key Evidence (3)');

  // Back on the graph, a click on the empty stage clears the selection: sigma takes the click.
  await page.getByRole('tab', { name: 'Graph View' }).click();
  const mouse = graph.locator('canvas.sigma-mouse');
  const box = await mouse.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 8, box!.y + box!.height - 8);
  await expect(side).toContainText('Select an object in the graph');
  expect(problems).toEqual([]);
});
