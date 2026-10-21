import { useEffect, useRef } from 'react';
import Sigma from 'sigma';
import { EdgeArrowProgram, EdgeLineProgram } from 'sigma/rendering';
import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useTheme } from '../app/theme';
import { IconButton } from '../ui/Button';
import { brightNodes, type ViewGraph } from './graphView';
import {
  buildDrawnGraph,
  layoutGraph,
  LARGE_GRAPH,
  type DrawnGraph,
  type EdgeAttributes,
  type GraphColors,
  type NodeAttributes,
} from './sigmaGraph';
import styles from './RelationGraph.module.css';

/** How long the worker refines a large graph's layout, in milliseconds. */
const REFINE_MS = 3000;

const MINI_WIDTH = 168;
const MINI_HEIGHT = 112;

/** Props for the canvas; see {@link RelationGraph}. */
export interface RelationGraphCanvasProps {
  graph: ViewGraph;
  colors: GraphColors;
  selected?: string;
  search: string;
  onSelect: (ref: string | undefined) => void;
}

/**
 * The WebGL graph behind {@link RelationGraph}, loaded on demand: sigma draws the laid-out graph,
 * with the selected node's neighborhood and the search's matches kept bright and the rest dimmed.
 * Clicking a node selects it and clicking the stage clears the selection. Zoom buttons sit on the
 * right, and a mini-map at the bottom right shows the whole graph with the visible part framed;
 * clicking it moves the view there.
 */
export default function RelationGraphCanvas({
  graph,
  colors,
  selected,
  search,
  onSelect,
}: RelationGraphCanvasProps) {
  const tokens = useTheme().tokens;
  const container = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Sigma<NodeAttributes, EdgeAttributes> | undefined>(undefined);
  const drawn = useRef<DrawnGraph | undefined>(undefined);
  // What the reducers read, kept current so a selection or search does not rebuild the renderer:
  // the selected node, and the nodes kept bright (undefined when nothing is dimmed).
  const focus = useRef<{ selected?: string; bright?: Set<string> }>({});
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    focus.current = {
      ...(selected !== undefined && { selected }),
      bright: brightNodes(graph, selected, search),
    };
    renderer.current?.refresh({ skipIndexation: true });
  }, [selected, search, graph]);

  useEffect(() => {
    const box = container.current;
    if (!box) return;
    const built = buildDrawnGraph(graph, colors);
    layoutGraph(built);
    drawn.current = built;
    const sigma = new Sigma<NodeAttributes, EdgeAttributes>(built, box, {
      allowInvalidContainer: true,
      defaultEdgeType: 'line',
      edgeProgramClasses: { line: EdgeLineProgram, arrow: EdgeArrowProgram },
      labelColor: { color: tokens.color.text },
      labelFont: tokens.font.family,
      labelSize: 11,
      labelRenderedSizeThreshold: 7,
      zIndex: true,
      nodeReducer: (ref, data) => {
        const { selected: chosen, bright } = focus.current;
        if (ref === chosen) return { ...data, highlighted: true, zIndex: 2 };
        if (!bright) return data;
        return bright.has(ref)
          ? { ...data, zIndex: 1 }
          : { ...data, color: tokens.color.borderStrong, label: '', zIndex: 0 };
      },
      edgeReducer: (edge, data) => {
        const { selected: chosen } = focus.current;
        if (chosen === undefined) return data;
        const touches = built.source(edge) === chosen || built.target(edge) === chosen;
        return touches ? { ...data, zIndex: 1 } : { ...data, color: tokens.color.border };
      },
    });
    renderer.current = sigma;
    sigma.on('clickNode', ({ node }) => select.current(node));
    sigma.on('clickStage', () => select.current(undefined));

    const drawMini = () => drawMiniMap(mini.current, sigma, built, tokens.color.accent);
    sigma.on('afterRender', drawMini);

    let supervisor: FA2LayoutSupervisor | undefined;
    let timer: number | undefined;
    if (built.order > LARGE_GRAPH) {
      supervisor = new FA2LayoutSupervisor(built, { settings: { barnesHutOptimize: true } });
      supervisor.start();
      timer = window.setTimeout(() => supervisor?.stop(), REFINE_MS);
    }
    return () => {
      window.clearTimeout(timer);
      supervisor?.kill();
      sigma.kill();
      renderer.current = undefined;
      drawn.current = undefined;
    };
  }, [graph, colors, tokens]);

  const camera = () => renderer.current?.getCamera();
  const onMiniClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const sigma = renderer.current;
    const built = drawn.current;
    if (!sigma || !built) return;
    const box = event.currentTarget.getBoundingClientRect();
    const frame = miniFrame(built);
    const point = {
      x: frame.minX + ((event.clientX - box.left) / MINI_WIDTH) * frame.width,
      y: frame.maxY - ((event.clientY - box.top) / MINI_HEIGHT) * frame.height,
    };
    const framed = sigma.viewportToFramedGraph(sigma.graphToViewport(point));
    void sigma.getCamera().animate({ x: framed.x, y: framed.y }, { duration: 300 });
  };

  return (
    <div className={styles.stage}>
      <div ref={container} className={styles.canvas} data-testid="graph-canvas" />
      <div className={styles.zoom}>
        <IconButton
          label="Zoom in"
          icon={<ZoomIn size={14} />}
          onClick={() => void camera()?.animatedZoom({ duration: 200 })}
        />
        <IconButton
          label="Zoom out"
          icon={<ZoomOut size={14} />}
          onClick={() => void camera()?.animatedUnzoom({ duration: 200 })}
        />
        <IconButton
          label="Fit the graph"
          icon={<Maximize2 size={14} />}
          onClick={() => void camera()?.animatedReset({ duration: 200 })}
        />
      </div>
      <canvas
        ref={mini}
        className={styles.miniMap}
        width={MINI_WIDTH}
        height={MINI_HEIGHT}
        aria-label="Mini-map"
        data-testid="graph-minimap"
        onClick={onMiniClick}
      />
    </div>
  );
}

/** The graph's extent in its own coordinates, padded, for the mini-map. */
function miniFrame(graph: DrawnGraph) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  graph.forEachNode((_, { x, y }) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX)) return { minX: -1, maxY: 1, width: 2, height: 2 };
  const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.08;
  return {
    minX: minX - pad,
    maxY: maxY + pad,
    width: maxX - minX + 2 * pad,
    height: maxY - minY + 2 * pad,
  };
}

/** Draws the mini-map: every node as a dot in its color, and the visible part as a frame. */
function drawMiniMap(
  canvas: HTMLCanvasElement | null,
  sigma: Sigma<NodeAttributes, EdgeAttributes>,
  graph: DrawnGraph,
  frameColor: string,
) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  const frame = miniFrame(graph);
  const toMini = (x: number, y: number): [number, number] => [
    ((x - frame.minX) / frame.width) * MINI_WIDTH,
    ((frame.maxY - y) / frame.height) * MINI_HEIGHT,
  ];
  context.clearRect(0, 0, MINI_WIDTH, MINI_HEIGHT);
  graph.forEachNode((_, { x, y, color }) => {
    const [mx, my] = toMini(x, y);
    context.fillStyle = color;
    context.fillRect(mx - 1, my - 1, 2.5, 2.5);
  });
  const { width, height } = sigma.getDimensions();
  const topLeft = sigma.viewportToGraph({ x: 0, y: 0 });
  const bottomRight = sigma.viewportToGraph({ x: width, y: height });
  const [x0, y0] = toMini(topLeft.x, topLeft.y);
  const [x1, y1] = toMini(bottomRight.x, bottomRight.y);
  context.strokeStyle = frameColor;
  context.lineWidth = 1;
  context.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}
