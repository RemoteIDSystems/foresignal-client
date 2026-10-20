import type { GeoRect } from '../records/tileMath';

/** Something that answers the wind at a point: `[u, v]` in m/s, or undefined where it has none. */
export interface WindSampler {
  sample(longitude: number, latitude: number): [number, number] | undefined;
}

/** One particle: where it is, the trail behind it, and how long it has lived. */
export interface Particle {
  longitude: number;
  latitude: number;
  /** Positions it has passed, oldest first, ending at its current position. */
  trail: [number, number][];
  /** Steps lived, and steps it lives before it is reborn elsewhere. */
  age: number;
  /** Seconds since the trail's newest point was fixed; the head moves until it is. */
  sinceMark: number;
  life: number;
  /** Wind speed at its position, m/s. */
  speed: number;
}

/** Positions a trail keeps. */
export const TRAIL_LENGTH = 7;

/**
 * Seconds between a trail's points, so a trail spans the same time (and, at a given wind, the
 * same length on screen) whatever the frame rate.
 */
export const TRAIL_INTERVAL = 1 / 15;

/** Screen pixels a particle moves per second for each m/s of wind. */
export const PIXELS_PER_SECOND_PER_MS = 5;

/** Shortest and longest life, in steps. */
const LIFE = [40, 110] as const;

/** Furthest north or south a particle is born; the map's own projection limit. */
const MAX_LATITUDE = 85;

/**
 * Wind particles advected through a {@link WindSampler} on the CPU: each step moves every particle
 * along the wind at its position, at a speed in screen pixels (so the flow looks the same at every
 * zoom), and records its trail. A particle that ages out, leaves the view, or reaches a point with
 * no wind is reborn at a random point in the view. The map draws the trails.
 */
export class ParticleSystem {
  readonly particles: Particle[] = [];
  private rect: GeoRect = { west: -180, south: -MAX_LATITUDE, east: 180, north: MAX_LATITUDE };

  /**
   * @param field The wind.
   * @param count How many particles.
   * @param random A source of numbers in [0, 1); `Math.random` by default.
   */
  constructor(
    private readonly field: WindSampler,
    count: number,
    private readonly random: () => number = Math.random,
  ) {
    for (let i = 0; i < count; i++) {
      const particle: Particle = {
        longitude: 0,
        latitude: 0,
        trail: [],
        age: 0,
        sinceMark: 0,
        life: 1,
        speed: 0,
      };
      this.respawn(particle);
      // Staggered ages, so the particles are not all reborn on the same step.
      particle.age = Math.floor(this.random() * particle.life);
      this.particles.push(particle);
    }
  }

  /** Sets the view the particles live in; undefined is the whole world. */
  setRect(rect: GeoRect | undefined): void {
    this.rect = rect
      ? {
          ...rect,
          south: Math.max(-MAX_LATITUDE, rect.south),
          north: Math.min(MAX_LATITUDE, rect.north),
        }
      : { west: -180, south: -MAX_LATITUDE, east: 180, north: MAX_LATITUDE };
    for (const particle of this.particles) {
      if (!this.inView(particle.longitude, particle.latitude)) this.respawn(particle);
    }
  }

  /**
   * Moves every particle `seconds` on. `degreesPerPixel` is the map's scale at the view center,
   * which turns the on-screen speed into degrees.
   */
  step(seconds: number, degreesPerPixel: number): void {
    const scale = PIXELS_PER_SECOND_PER_MS * degreesPerPixel * seconds;
    for (const particle of this.particles) {
      particle.age++;
      const wind = this.field.sample(particle.longitude, particle.latitude);
      if (!wind || particle.age > particle.life) {
        this.respawn(particle);
        continue;
      }
      const [u, v] = wind;
      particle.speed = Math.hypot(u, v);
      const cos = Math.max(0.05, Math.cos((particle.latitude * Math.PI) / 180));
      particle.latitude += v * scale;
      const before = particle.longitude;
      particle.longitude = wrapLongitude(particle.longitude + (u * scale) / cos);
      if (!this.inView(particle.longitude, particle.latitude)) {
        this.respawn(particle);
        continue;
      }
      // Across the antimeridian the trail starts again, so it never spans the whole map.
      if (Math.abs(particle.longitude - before) > 180) particle.trail = [];
      // The head moves with the particle; every TRAIL_INTERVAL it is fixed and a new head starts.
      particle.sinceMark += seconds;
      const head: [number, number] = [particle.longitude, particle.latitude];
      if (particle.trail.length < 2 || particle.sinceMark >= TRAIL_INTERVAL) {
        particle.sinceMark = 0;
        particle.trail.push(head);
        if (particle.trail.length > TRAIL_LENGTH) particle.trail.shift();
      } else {
        particle.trail[particle.trail.length - 1] = head;
      }
    }
  }

  /** Puts a particle at a random point in the view, with a fresh life and no trail. */
  private respawn(particle: Particle): void {
    const { west, south, east, north } = this.rect;
    const width = west <= east ? east - west : east + 360 - west;
    particle.longitude = wrapLongitude(west + this.random() * width);
    particle.latitude = south + this.random() * (north - south);
    particle.trail = [[particle.longitude, particle.latitude]];
    particle.age = 0;
    particle.sinceMark = 0;
    particle.life = LIFE[0] + Math.floor(this.random() * (LIFE[1] - LIFE[0]));
    particle.speed = 0;
  }

  /** True when a point is in the view (which may cross the antimeridian). */
  private inView(longitude: number, latitude: number): boolean {
    const { west, south, east, north } = this.rect;
    if (latitude < south || latitude > north) return false;
    return west <= east
      ? longitude >= west && longitude <= east
      : longitude >= west || longitude <= east;
  }
}

/** A longitude brought into [-180, 180). */
export function wrapLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}
