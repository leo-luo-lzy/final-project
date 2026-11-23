import {vec3} from 'gl-matrix';
import Stats from 'stats-js';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import LineBatch from './rendering/gl/LineBatch';
import Accumulator from './rendering/gl/Accumulator';
import Square from './geometry/Square';
import FlowField, {FIELD_PERLIN, FIELD_CURL} from './field/FlowField';
import Particles, {Mouse, MOUSE_DRAG, MOUSE_SWIRL} from './sim/Particles';
import {setNoiseSeed} from './noise/perlin';
import lineVertSrc from './shaders/line-vert.glsl?raw';
import lineFragSrc from './shaders/line-frag.glsl?raw';
import screenVertSrc from './shaders/screen-vert.glsl?raw';
import compositeFragSrc from './shaders/composite-frag.glsl?raw';
import * as DAT from 'dat.gui';
import ImageGuide from './field/ImageGuide';
import fadeFragSrc from './shaders/fade-frag.glsl?raw';

const PAPER = [0.96, 0.94, 0.89];
const CELL_SIZE = 8;
const MAX_PARTICLES = 50000;
const IMAGE_MAX_SIZE = 512;

const defaultParams = {
  mouseMode: 'Drag',
  mouseRadius: 200,
  mouseStrength: 1.0,
  mode: 'Noise',
  edgeThreshold: 0.05,
  tensorRadius: 4,
  field: 'Curl',
  seed: 256,
  noiseScale: 512,
  octaves: 3,
  particleCount: 20000,
  speed: 120,
  alpha: 0.08,
  style: 'Ink',
  inkStrength: 1.0,
  paused: false,
  alignFlow: false,
  fade: 0.004,
  showField: false,
  paperTexture: 0,
};

function main() {
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) { alert('WebGL 2 not supported!'); return; }
  setGL(gl);
  if (!gl.getExtension('EXT_color_buffer_float')) {
    alert('EXT_color_buffer_float not supported!');
    return;
  }

  const renderer = new OpenGLRenderer(canvas);
  gl.disable(gl.DEPTH_TEST);

  const accum = new Accumulator();
  let field: FlowField;
  let particles: Particles;
  let guide: ImageGuide = null;
  let saveRequested = false;

  const imageInput = <HTMLInputElement> document.getElementById('imageInput');

  const controls = {
    ...defaultParams,
    'Load Image': () => {
      imageInput.click();
    },
    'Clear': () => {
      accum.clear();
    },
    'New Seed': () => {
      controls.seed = Math.floor(Math.random() * 1000);
      restart();
      guiControllers.forEach(c => c.updateDisplay());
    },
    'Save PNG': () => {
      saveRequested = true;
    },
    'Reset': () => {
      Object.assign(controls, defaultParams);
      restart();
      guiControllers.forEach(c => c.updateDisplay());
    },
  };

  function restart() {
    setNoiseSeed(controls.seed);
    const type = controls.field === 'Curl' ? FIELD_CURL : FIELD_PERLIN;
    field = new FlowField(canvas.width, canvas.height, CELL_SIZE);
    field.build(type, controls.noiseScale, controls.octaves, 0.0);

    let activeGuide: ImageGuide = null;
    if (controls.mode === 'Image' && guide) {
      guide.fitTo(canvas.width, canvas.height);
      guide.computeTensor(controls.tensorRadius);
      field.applyImage(guide, controls.edgeThreshold);
      activeGuide = guide;
    }
    particles = new Particles(controls.particleCount, canvas.width, canvas.height, activeGuide);
    accum.clear();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(window.innerWidth * dpr),
                     Math.floor(window.innerHeight * dpr));
    accum.resize(canvas.width, canvas.height);
    restart();
  }
  window.addEventListener('resize', resize);
  resize();

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      guide = new ImageGuide(img, IMAGE_MAX_SIZE);
      URL.revokeObjectURL(img.src);
      controls.mode = 'Image';
      restart();
      guiControllers.forEach(c => c.updateDisplay());
    };
    img.src = URL.createObjectURL(file);
    imageInput.value = '';
  });

  const mouse: Mouse = {active: false, x: 0, y: 0, vx: 0, vy: 0, mode: MOUSE_DRAG, radius: 200, strength: 1.0};
  let mousePrevX = 0;
  let mousePrevY = 0;

  function updatePointer(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * canvas.width / rect.width;
    mouse.y = (e.clientY - rect.top) * canvas.height / rect.height;
  }

  canvas.addEventListener('pointerdown', (e) => {
    updatePointer(e);
    mousePrevX = mouse.x;
    mousePrevY = mouse.y;
    mouse.vx = 0;
    mouse.vy = 0;
    mouse.active = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mouse.active) updatePointer(e);
  });
  canvas.addEventListener('pointerup', () => { mouse.active = false; });
  canvas.addEventListener('pointercancel', () => { mouse.active = false; });

  const gui = new DAT.GUI();

  const guiControllers = [
    gui.add(controls, 'showField'),
    gui.add(controls, 'mode', ['Noise', 'Image']).onFinishChange(restart),

    gui.add(controls, 'edgeThreshold', 0.005, 0.3).step(0.005).onFinishChange(restart),

    gui.add(controls, 'tensorRadius', 0, 12).step(1).onFinishChange(restart),
    gui.add(controls, 'alignFlow'),
    
    gui.add(controls, 'field', ['Curl', 'Perlin']).onFinishChange(restart),

    gui.add(controls, 'seed', 0, 1000).step(1).onFinishChange(restart),

    gui.add(controls, 'noiseScale', 10, 6000).step(10).onFinishChange(restart),

    gui.add(controls, 'octaves', 1, 6).step(1).onFinishChange(restart),

    gui.add(controls, 'particleCount', 1000, MAX_PARTICLES).step(1000).onFinishChange(restart),

    gui.add(controls, 'speed', 20, 400),

    gui.add(controls, 'alpha', 0.01, 0.3).step(0.01),

    gui.add(controls, 'style', ['Ink', 'Glow']),

    gui.add(controls, 'inkStrength', 0.2, 3.0).step(0.05),

    gui.add(controls, 'paperTexture', 0, 1).step(0.05),

    gui.add(controls, 'mouseMode', ['Drag', 'Swirl']),

    gui.add(controls, 'mouseRadius', 20, 600).step(10),

    gui.add(controls, 'mouseStrength', 0, 3).step(0.05),

    gui.add(controls, 'fade', 0, 0.05).step(0.002),

    gui.add(controls, 'paused'),
  ];
  gui.add(controls, 'Load Image');
  gui.add(controls, 'Clear');
  gui.add(controls, 'New Seed');
  gui.add(controls, 'Save PNG');
  gui.add(controls, 'Reset');

  
  const lineProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lineVertSrc),
    new Shader(gl.FRAGMENT_SHADER, lineFragSrc),
  ]);
  const compositeProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, screenVertSrc),
    new Shader(gl.FRAGMENT_SHADER, compositeFragSrc),
  ]);
  const fadeProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, screenVertSrc),
    new Shader(gl.FRAGMENT_SHADER, fadeFragSrc),
  ]);

  const batch = new LineBatch(MAX_PARTICLES);
  const debugBatch = new LineBatch(100000);
  const screenQuad = new Square(vec3.fromValues(0, 0, 0));
  screenQuad.create();

  let prev = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    stats.begin();
    if (!controls.paused) {
      field.alignSigns = controls.alignFlow;
      mouse.mode = controls.mouseMode === 'Drag' ? MOUSE_DRAG : MOUSE_SWIRL;
      mouse.radius = controls.mouseRadius;
      mouse.strength = controls.mouseStrength;
      if (dt > 0) {
        mouse.vx += ((mouse.x - mousePrevX) / dt - mouse.vx) * 0.3;
        mouse.vy += ((mouse.y - mousePrevY) / dt - mouse.vy) * 0.3;
      }
      mousePrevX = mouse.x;
      mousePrevY = mouse.y;

      if (mouse.active) {
        field.sculpt(mouse, Math.min(mouse.strength * 8.0 * dt, 1.0));
      }

      particles.step(field, controls.speed, dt, controls.alpha, mouse, batch);
      accum.bind();
      gl.enable(gl.BLEND);
      if (controls.fade > 0) {
        const keep = Math.pow(1.0 - controls.fade, dt * 60.0);
        gl.blendColor(keep, keep, keep, keep);
        gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
        fadeProg.draw(screenQuad);
      }
      gl.blendFunc(gl.ONE, gl.ONE);
      lineProg.setResolution(accum.width, accum.height);
      batch.draw();
      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.texture);
    compositeProg.setAccum(0);
    compositeProg.setPaper(PAPER[0], PAPER[1], PAPER[2]);
    compositeProg.setInkStrength(controls.inkStrength);
    compositeProg.setPaperTex(controls.paperTexture);
    compositeProg.setMode(controls.style === 'Ink' ? 0 : 1);
    compositeProg.draw(screenQuad);

    if (controls.showField) {
      lineProg.setResolution(canvas.width, canvas.height);
      field.drawDebug(debugBatch, 3, 18, !controls.alignFlow);
      debugBatch.draw();
    }

    if (saveRequested) {
      saveRequested = false;
      const link = document.createElement('a');
      link.download = 'flow-field-' + controls.seed + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    stats.end();
    requestAnimationFrame(tick);
  }
  tick();
}

main();
