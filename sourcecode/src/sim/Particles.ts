import FlowField from '../field/FlowField';
import ImageGuide from '../field/ImageGuide';
import LineBatch from '../rendering/gl/LineBatch';

export const MOUSE_DRAG = 0;
export const MOUSE_SWIRL = 1;
export const MOUSE_PUSH = 2;

export interface Mouse {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: number;
  radius: number;
  strength: number;
}

const INKS = [
  [0.07, 0.08, 0.09],
  [0.10, 0.14, 0.32],
  [0.45, 0.18, 0.10],
];

class Particles {
  count: number;
  width: number;
  height: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  age: Float32Array;
  life: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  guide: ImageGuide;
  vel: Float32Array = new Float32Array(2);

  constructor(count: number, width: number, height: number, guide: ImageGuide) {
    this.count = count;
    this.width = width;
    this.height = height;
    this.guide = guide;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count);
    this.r = new Float32Array(count);
    this.g = new Float32Array(count);
    this.b = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.respawn(i);
    }
  }

  respawn(i: number) {
    this.x[i] = Math.random() * this.width;
    this.y[i] = Math.random() * this.height;
    this.vx[i] = 0.0;
    this.vy[i] = 0.0;
    this.age[i] = 0.0;
    this.life[i] = 2.0 + Math.random() * 4.0;

    if (this.guide) {
      const k = this.guide.indexAt(this.x[i], this.y[i]);
      this.r[i] = this.guide.r[k];
      this.g[i] = this.guide.g[k];
      this.b[i] = this.guide.b[k];
    } else {
      const p = Math.random();
      const ink = p < 0.2 ? INKS[0] : (p < 0.7 ? INKS[1] : INKS[2]);
      this.r[i] = ink[0];
      this.g[i] = ink[1];
      this.b[i] = ink[2];
    }
  }

  step(field: FlowField, speed: number, dt: number, alpha: number, mouse: Mouse, batch: LineBatch) {
    batch.clear();
    const r2 = mouse.radius * mouse.radius;
    for (let i = 0; i < this.count; i++) {
      const x0 = this.x[i];
      const y0 = this.y[i];
      field.sample(x0, y0, this.vx[i], this.vy[i], this.vel);

      if (this.vel[0] * this.vx[i] + this.vel[1] * this.vy[i] < 0) {
        this.vel[0] = -this.vel[0];
        this.vel[1] = -this.vel[1];
      }

      let fx = 0.0;
      let fy = 0.0;
      if (mouse.active) {
        const dx = x0 - mouse.x;
        const dy = y0 - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 9.0 * r2) {
          const f = Math.exp(-d2 / r2) * mouse.strength;
          if (mouse.mode === MOUSE_DRAG) {
            fx = mouse.vx * f;
            fy = mouse.vy * f;
          } else {
            const g = f * speed * 4.0 / mouse.radius;
            if (mouse.mode === MOUSE_SWIRL) {
              fx = -dy * g;
              fy = dx * g;
            } else {
              fx = dx * g;
              fy = dy * g;
            }
          }
        }
      }

      const x1 = x0 + (this.vel[0] * speed + fx) * dt;
      const y1 = y0 + (this.vel[1] * speed + fy) * dt;
      this.age[i] += dt;

      if (x1 < 0 || x1 >= this.width || y1 < 0 || y1 >= this.height || this.age[i] > this.life[i]) {
        this.respawn(i);
        continue;
      }
      batch.push(x0, y0, x1, y1, this.r[i], this.g[i], this.b[i], alpha);
      this.x[i] = x1;
      this.y[i] = y1;
      this.vx[i] = this.vel[0];
      this.vy[i] = this.vel[1];
    }
  }
}
export default Particles;
