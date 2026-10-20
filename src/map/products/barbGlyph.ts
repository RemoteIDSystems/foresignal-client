/** The marks of one wind barb. */
export interface BarbParts {
  /** True below 5 kt: drawn as a calm circle, with no staff. */
  calm: boolean;
  /** 50-kt pennants. */
  pennants: number;
  /** 10-kt full barbs. */
  full: number;
  /** 5-kt half barbs (0 or 1). */
  half: number;
}

/** The marks for a speed in knots, rounded to the nearest 5 kt as the station model does. */
export function barbParts(knots: number): BarbParts {
  const rounded = Math.max(0, Math.round(knots / 5) * 5);
  if (rounded < 5) return { calm: true, pennants: 0, full: 0, half: 0 };
  const pennants = Math.floor(rounded / 50);
  const rest = rounded - pennants * 50;
  return { calm: false, pennants, full: Math.floor(rest / 10), half: rest % 10 >= 5 ? 1 : 0 };
}

/** A barb's size in CSS pixels: the staff runs up the middle from the station at the bottom. */
export const BARB_SIZE = { width: 28, height: 30 } as const;

/** Staff length, feather length and spacing, in CSS pixels. */
const STAFF = 24;
const FEATHER = 10;
const SPACING = 4;

/**
 * Draws a barb pointing up (north): the staff from the station (bottom center) toward where the
 * wind blows from, its feathers on the staff's right at the far end, as plotted in the northern
 * hemisphere. The map rotates it by the wind's `fromDeg`. White with a dark halo, so it reads over
 * both the night lights and the speed raster. `ratio` is the device pixel ratio.
 */
export function drawBarb(knots: number, ratio = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(BARB_SIZE.width * ratio);
  canvas.height = Math.ceil(BARB_SIZE.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.scale(ratio, ratio);
  const x = BARB_SIZE.width / 2;
  const bottom = BARB_SIZE.height - 3;
  const parts = barbParts(knots);
  const path = new Path2D();
  const fills = new Path2D();
  if (parts.calm) {
    path.arc(x, bottom - 3, 3, 0, Math.PI * 2);
  } else {
    const top = bottom - STAFF;
    path.moveTo(x, bottom);
    path.lineTo(x, top);
    let at = top;
    for (let i = 0; i < parts.pennants; i++) {
      fills.moveTo(x, at);
      fills.lineTo(x + FEATHER, at + SPACING / 2);
      fills.lineTo(x, at + SPACING * 1.5);
      fills.closePath();
      at += SPACING * 2;
    }
    for (let i = 0; i < parts.full; i++) {
      path.moveTo(x, at);
      path.lineTo(x + FEATHER, at - SPACING);
      at += SPACING;
    }
    // A lone half barb sits one step in from the end, so it is not read as a full one.
    if (parts.half) {
      if (parts.pennants === 0 && parts.full === 0) at += SPACING;
      path.moveTo(x, at);
      path.lineTo(x + FEATHER / 2, at - SPACING / 2);
    }
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(5, 12, 24, 0.85)';
  context.fillStyle = 'rgba(5, 12, 24, 0.85)';
  context.lineWidth = 3.5;
  context.stroke(path);
  context.stroke(fills);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.stroke(path);
  context.fill(fills);
  return canvas;
}
