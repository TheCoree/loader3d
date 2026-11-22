/**
 * A stand-in for the Scriptable API, enough to run loader3d-widget.js outside the phone: in Node
 * (check.mjs — does every size and view build without errors) and in a browser (index.html — what it looks
 * like). The widget becomes a plain tree of objects; render.js turns it into HTML.
 *
 * Only what the widget uses is here, with Scriptable's semantics: stacks are horizontal and centred by
 * default, `addSpacer()` without a length is flexible, DrawContext paths are filled and then cleared.
 */

const WEIGHTS = {
  ultraLight: 200, thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900,
};

export class Color {
  constructor(hex, alpha = 1) {
    const value = String(hex).replace('#', '');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) throw new Error(`Color: bad hex ${hex}`);
    this.hex = value.slice(0, 6).toUpperCase();
    this.alpha = value.length === 8 ? parseInt(value.slice(6), 16) / 255 : alpha;
  }
  static dynamic(light, dark) {
    const color = new Color(light.hex, light.alpha);
    color.light = light;
    color.dark = dark;
    return color;
  }
  static white() { return new Color('FFFFFF'); }
  static black() { return new Color('000000'); }
  static clear() { return new Color('000000', 0); }
  static gray() { return new Color('808080'); }
  /** CSS colour for the given appearance. */
  css(theme = 'light') {
    const color = this.light ? (theme === 'dark' ? this.dark : this.light) : this;
    const n = parseInt(color.hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${color.alpha})`;
  }
}

export class Font {
  constructor(size, weight = 400, design = 'default') {
    if (!(size > 0)) throw new Error(`Font: bad size ${size}`);
    Object.assign(this, { size, weight, design });
  }
  static systemFont(size) { return new Font(size); }
  static boldSystemFont(size) { return new Font(size, 700); }
  static italicSystemFont(size) { return Object.assign(new Font(size), { italic: true }); }
}
for (const [name, weight] of Object.entries(WEIGHTS)) {
  Font[`${name}SystemFont`] = (size) => new Font(size, weight);
  Font[`${name}RoundedSystemFont`] = (size) => new Font(size, weight, 'rounded');
  Font[`${name}MonospacedSystemFont`] = (size) => new Font(size, weight, 'monospaced');
}

export class Size {
  constructor(width, height) { Object.assign(this, { width, height }); }
}
export class Point {
  constructor(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Point: not finite ${x}, ${y}`);
    Object.assign(this, { x, y });
  }
}
export class Rect {
  constructor(x, y, width, height) {
    if (![x, y, width, height].every(Number.isFinite)) throw new Error('Rect: not finite');
    Object.assign(this, { x, y, width, height });
  }
  get minX() { return this.x; }
  get minY() { return this.y; }
  get maxX() { return this.x + this.width; }
  get maxY() { return this.y + this.height; }
}

export class Path {
  constructor() { this.ops = []; }
  move(point) { this.ops.push(['move', point]); }
  addLine(point) {
    if (!this.ops.length) throw new Error('Path.addLine before move');
    this.ops.push(['line', point]);
  }
  addLines(points) { points.forEach((p, i) => this.ops.push([i ? 'line' : 'move', p])); }
  addRect(rect) { this.ops.push(['rect', rect]); }
  addRoundedRect(rect, cornerWidth, cornerHeight) { this.ops.push(['roundedRect', rect, cornerWidth, cornerHeight]); }
  addEllipse(rect) { this.ops.push(['ellipse', rect]); }
  closeSubpath() { this.ops.push(['close']); }
}

/** An image: an SF Symbol by name, or a picture of a DrawContext (`dataUrl` in a browser). */
export class Image {
  constructor(props) { Object.assign(this, props); }
}

export class SFSymbol {
  static named(name) {
    const symbol = new SFSymbol();
    symbol.name = name;
    return symbol;
  }
  applyFont(font) { this.font = font; }
  get image() { return new Image({ kind: 'symbol', name: this.name, size: new Size(this.font?.size ?? 17, this.font?.size ?? 17) }); }
}

function makeDrawContext(canvasFactory) {
  return class DrawContext {
    constructor() {
      this.size = new Size(100, 100);
      this.opaque = true;
      this.respectScreenScale = false;
      this.ops = [];
      this.path = [];
      this.state = { fill: Color.black(), stroke: Color.black(), lineWidth: 1 };
    }
    setFillColor(color) { this.ops.push(['fill', color]); }
    setStrokeColor(color) { this.ops.push(['stroke', color]); }
    setLineWidth(width) { this.ops.push(['lineWidth', width]); }
    addPath(path) { this.path.push(...path.ops); }
    fillPath() { this.ops.push(['fillPath', this.path]); this.path = []; }
    strokePath() { this.ops.push(['strokePath', this.path]); this.path = []; }
    fillRect(rect) { this.ops.push(['fillPath', [['rect', rect]]]); }
    fillEllipse(rect) { this.ops.push(['fillPath', [['ellipse', rect]]]); }
    strokeRect(rect) { this.ops.push(['strokePath', [['rect', rect]]]); }
    strokeEllipse(rect) { this.ops.push(['strokePath', [['ellipse', rect]]]); }
    getImage() {
      const { width, height } = this.size;
      if (!(width > 0 && height > 0)) throw new Error(`DrawContext: bad size ${width}×${height}`);
      const image = new Image({ kind: 'canvas', size: new Size(width, height), ops: this.ops.length });
      if (canvasFactory) image.dataUrl = paint(canvasFactory, this);
      return image;
    }
  };
}

function paint(canvasFactory, dc) {
  const scale = 3;
  const { canvas, context: ctx } = canvasFactory(Math.ceil(dc.size.width * scale), Math.ceil(dc.size.height * scale));
  ctx.scale(scale, scale);
  const trace = (ops) => {
    ctx.beginPath();
    for (const [kind, a, b, c] of ops) {
      if (kind === 'move') ctx.moveTo(a.x, a.y);
      else if (kind === 'line') ctx.lineTo(a.x, a.y);
      else if (kind === 'close') ctx.closePath();
      else if (kind === 'rect') ctx.rect(a.x, a.y, a.width, a.height);
      else if (kind === 'roundedRect') ctx.roundRect(a.x, a.y, a.width, a.height, Math.min(b, c));
      else if (kind === 'ellipse') {
        ctx.moveTo(a.x + a.width, a.y + a.height / 2);
        ctx.ellipse(a.x + a.width / 2, a.y + a.height / 2, a.width / 2, a.height / 2, 0, 0, 2 * Math.PI);
      }
    }
  };
  for (const [kind, value] of dc.ops) {
    if (kind === 'fill') ctx.fillStyle = value.css();
    else if (kind === 'stroke') ctx.strokeStyle = value.css();
    else if (kind === 'lineWidth') ctx.lineWidth = value;
    else if (kind === 'fillPath') { trace(value); ctx.fill(); }
    else if (kind === 'strokePath') { trace(value); ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  return canvas.toDataURL('image/png');
}

// --- widget elements: a plain tree -----------------------------------------------------------------

class Container {
  constructor(type) {
    this.type = type;
    this.children = [];
    this.spacing = 0;
  }
  addText(value) {
    if (typeof value !== 'string') throw new Error(`addText: not a string: ${value}`);
    const text = { type: 'text', text: value, font: Font.regularSystemFont(17), textColor: null, lineLimit: 0, minimumScaleFactor: 1, align: 'left' };
    text.leftAlignText = () => { text.align = 'left'; };
    text.centerAlignText = () => { text.align = 'center'; };
    text.rightAlignText = () => { text.align = 'right'; };
    this.children.push(text);
    return text;
  }
  addImage(image) {
    if (!(image instanceof Image)) throw new Error('addImage: not an Image');
    const item = { type: 'image', image, imageSize: null, tintColor: null, imageOpacity: 1 };
    this.children.push(item);
    return item;
  }
  addSpacer(length) {
    if (length != null && !(length >= 0)) throw new Error(`addSpacer: bad length ${length}`);
    const spacer = { type: 'spacer', length: length ?? null };
    this.children.push(spacer);
    return spacer;
  }
  addStack() {
    const stack = new WidgetStack();
    this.children.push(stack);
    return stack;
  }
  setPadding(top, leading, bottom, trailing) { this.padding = [top, leading, bottom, trailing]; }
}

export class WidgetStack extends Container {
  constructor() {
    super('stack');
    this.layout = 'horizontal';
    this.align = 'center';
    this.size = new Size(0, 0);
    this.padding = [0, 0, 0, 0];
  }
  layoutHorizontally() { this.layout = 'horizontal'; }
  layoutVertically() { this.layout = 'vertical'; }
  topAlignContent() { this.align = 'top'; }
  centerAlignContent() { this.align = 'center'; }
  bottomAlignContent() { this.align = 'bottom'; }
}

// --- the runtime -----------------------------------------------------------------------------------

/**
 * Globals for one run of the script. `fetch(request)` answers a Request: {status, body} or throws (no
 * connection). `keychain` and `files` are plain objects, changed in place.
 */
export function createRuntime({
  family = 'small',
  parameter = null,
  inApp = false,
  keychain = {},
  files = {},
  fetch = async () => { throw new Error('offline'); },
  screen = { width: 393, height: 852 },
  isPad = false,
  canvasFactory = null,
  onAlert = null,
  clipboard = { value: '' },
}) {
  const outcome = { widget: null, completed: false, presented: null, alerts: [] };

  class ListWidget extends Container {
    constructor() {
      super('widget');
      this.padding = null; // the system default
      this.backgroundColor = null;
      this.backgroundImage = null;
      this.addAccessoryWidgetBackground = false;
      this.url = null;
      this.refreshAfterDate = null;
    }
    useDefaultPadding() { this.padding = null; }
  }
  for (const f of ['Small', 'Medium', 'Large', 'ExtraLarge', 'AccessoryCircular', 'AccessoryRectangular', 'AccessoryInline']) {
    ListWidget.prototype[`present${f}`] = async function present() {
      outcome.presented = { family: f[0].toLowerCase() + f.slice(1), widget: this };
    };
  }

  class Request {
    constructor(url) {
      this.url = url;
      this.method = 'GET';
      this.headers = {};
      this.timeoutInterval = 60;
      this.response = null;
    }
    async loadString() {
      const answer = await fetch(this);
      this.response = { statusCode: answer.status, headers: answer.headers ?? {} };
      return answer.body ?? '';
    }
    async loadJSON() { return JSON.parse(await this.loadString()); }
  }

  class Alert {
    constructor() {
      this.title = '';
      this.message = '';
      this.actions = [];
      this.fields = [];
      this.cancel = null;
    }
    addAction(title) { this.actions.push(title); }
    addDestructiveAction(title) { this.actions.push(title); }
    addCancelAction(title) { this.cancel = title; }
    addTextField(placeholder = '', text = '') { this.fields.push({ placeholder, text, secure: false }); }
    addSecureTextField(placeholder = '', text = '') { this.fields.push({ placeholder, text, secure: true }); }
    textFieldValue(index) { return this.fields[index].text; }
    async present() {
      if (!inApp) throw new Error('Alert in a widget');
      outcome.alerts.push(this);
      const answer = onAlert ? await onAlert(this) : -1;
      return answer;
    }
    presentAlert() { return this.present(); }
    presentSheet() { return this.present(); }
  }

  const fileManager = {
    documentsDirectory: () => '/Documents',
    libraryDirectory: () => '/Library',
    joinPath: (a, b) => `${a.replace(/\/$/, '')}/${b}`,
    fileExists: (path) => Object.hasOwn(files, path),
    readString: (path) => {
      if (!Object.hasOwn(files, path)) throw new Error(`no file ${path}`);
      return files[path];
    },
    writeString: (path, value) => { files[path] = String(value); },
    remove: (path) => { delete files[path]; },
  };

  const globals = {
    Color, Font, Size, Point, Rect, Path, Image, SFSymbol, ListWidget, WidgetStack, Request, Alert,
    DrawContext: makeDrawContext(canvasFactory),
    Keychain: {
      contains: (key) => Object.hasOwn(keychain, key),
      get: (key) => {
        if (!Object.hasOwn(keychain, key)) throw new Error(`Keychain: no ${key}`);
        return keychain[key];
      },
      set: (key, value) => { keychain[key] = String(value); },
      remove: (key) => { delete keychain[key]; },
    },
    FileManager: { local: () => fileManager, iCloud: () => { throw new Error('the widget must not use iCloud'); } },
    Pasteboard: { pasteString: () => clipboard.value, copyString: (value) => { clipboard.value = value; } },
    Device: {
      screenSize: () => new Size(screen.width, screen.height),
      isPad: () => isPad,
      isPhone: () => !isPad,
      locale: () => 'ru_RU',
      language: () => 'ru',
    },
    config: {
      runsInWidget: !inApp && !family.startsWith('accessory'),
      runsInAccessoryWidget: !inApp && family.startsWith('accessory'),
      runsInApp: inApp,
      widgetFamily: inApp ? undefined : family,
    },
    args: { widgetParameter: parameter },
    Script: {
      setWidget: (widget) => { outcome.widget = widget; },
      complete: () => { outcome.completed = true; },
      name: () => 'Loader3D',
    },
  };
  return { globals, outcome };
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Runs the script's source with the runtime's globals; resolves with the outcome. */
export async function runScript(source, options) {
  const { globals, outcome } = createRuntime(options);
  const names = Object.keys(globals);
  const body = new AsyncFunction(...names, source);
  await body(...names.map((name) => globals[name]));
  return outcome;
}
