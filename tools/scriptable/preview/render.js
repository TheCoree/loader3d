/**
 * Draws a widget tree of scriptable-shim.js as HTML, close to how iOS lays it out: stacks are flex boxes,
 * a stack with a flexible spacer (or such a child) takes the whole width or height offered, text shrinks to
 * `minimumScaleFactor` before it is cut. SF Symbols are rough SVG stand-ins.
 */

/** Points of an iPhone 15 Pro (393×852): what loader3d-widget.js computes for it too. */
export const FRAMES = {
  small: [158, 158],
  medium: [338, 158],
  large: [338, 354],
  extraLarge: [704, 342],
  accessoryCircular: [72, 72],
  accessoryRectangular: [160, 72],
  accessoryInline: [250, 22],
};

const SYMBOLS = {
  'circle.fill': '<circle cx="12" cy="12" r="10" fill="currentColor"/>',
  'checkmark.circle.fill':
    '<circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M7 12.4l3.3 3.3L17.2 8.8" fill="none" stroke="var(--cut)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  'xmark.octagon.fill':
    '<path d="M8 1.5h8L22.5 8v8L16 22.5H8L1.5 16V8z" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--cut)" stroke-width="2.4" stroke-linecap="round"/>',
  'exclamationmark.triangle.fill':
    '<path d="M10.3 3.2a2 2 0 0 1 3.4 0l9 15.6a2 2 0 0 1-1.7 3H3a2 2 0 0 1-1.7-3z" fill="currentColor"/><path d="M12 8.5v5.5" stroke="var(--cut)" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.4" fill="var(--cut)"/>',
  'wifi.slash':
    '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.6" fill="currentColor"/>',
  'key.fill':
    '<circle cx="7.5" cy="12" r="5.5" fill="currentColor"/><path d="M12 10.5h10v3h-2v3h-3v-3h-5z" fill="currentColor"/><circle cx="6.5" cy="12" r="1.6" fill="var(--cut)"/>',
  'questionmark.circle':
    '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.2" fill="currentColor"/>',
  'arrow.uturn.right':
    '<path d="M15 5l5 5-5 5M20 10H9a5 5 0 0 0 0 10h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  'shippingbox.fill':
    '<path d="M12 1.8l9.5 4.7v11L12 22.2l-9.5-4.7v-11z" fill="currentColor"/><path d="M2.8 6.7L12 11.3l9.2-4.6M12 11.3v10.6" fill="none" stroke="var(--cut)" stroke-width="1.4" opacity=".55"/>',
  'person.2.fill':
    '<circle cx="8.5" cy="8" r="3.6" fill="currentColor"/><path d="M1.5 19.5c0-3.9 3.1-6.3 7-6.3s7 2.4 7 6.3z" fill="currentColor"/><circle cx="16.5" cy="7.3" r="3" fill="currentColor" opacity=".75"/><path d="M15.6 12.6c4 .1 6.9 2.4 6.9 6H17c0-2.4-.5-4.4-1.4-6z" fill="currentColor" opacity=".75"/>',
  rublesign:
    '<path d="M8.5 21V3.5h5.2a4.3 4.3 0 0 1 0 8.6H6M6 16.5h9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  'person.badge.plus':
    '<circle cx="9" cy="8" r="4" fill="currentColor"/><path d="M1.5 20.5c0-4.2 3.4-6.8 7.5-6.8s7.5 2.6 7.5 6.8z" fill="currentColor"/><path d="M19 7v7M15.5 10.5h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

const FAMILY_FONT = '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif';
const ROUNDED_FONT = '"SF Pro Rounded", ui-rounded, "Inter", system-ui, sans-serif';

function measure(node) {
  if (node.type === 'spacer') return { h: false, v: false, flexible: node.length == null };
  if (node.type !== 'stack') return { h: false, v: false };
  const kids = node.children.map(measure);
  node._kids = kids;
  const flexible = kids.some((k) => k.flexible);
  const fixedW = node.size && node.size.width > 0;
  const fixedH = node.size && node.size.height > 0;
  return {
    h: !fixedW && ((node.layout === 'horizontal' && flexible) || kids.some((k) => k.h)),
    v: !fixedH && ((node.layout === 'vertical' && flexible) || kids.some((k) => k.v)),
  };
}

function styleAsChild(dom, info, parentLayout) {
  if (parentLayout === 'horizontal') {
    if (info.h) dom.style.flex = '1 1 0';
    else dom.style.flex = '0 1 auto';
    if (info.v) dom.style.alignSelf = 'stretch';
  } else {
    if (info.v) dom.style.flex = '1 1 0';
    else dom.style.flex = '0 1 auto';
    if (info.h) dom.style.alignSelf = 'stretch';
  }
  dom.style.minWidth = '0';
  dom.style.minHeight = '0';
  dom.style.maxWidth = '100%';
}

function renderNode(node, theme, parentLayout, info) {
  if (node.type === 'spacer') {
    const dom = document.createElement('div');
    if (node.length == null) dom.style.flex = '1 1 0';
    else dom.style.flex = `0 0 ${node.length}px`;
    dom.style.minWidth = '0';
    dom.style.minHeight = '0';
    return dom;
  }
  if (node.type === 'text') {
    const dom = document.createElement('div');
    dom.textContent = node.text;
    const font = node.font;
    dom.style.fontSize = `${font.size}px`;
    dom.style.fontWeight = String(font.weight);
    dom.style.fontFamily = font.design === 'rounded' ? ROUNDED_FONT : FAMILY_FONT;
    dom.style.lineHeight = '1.2';
    dom.style.color = node.textColor ? node.textColor.css(theme) : theme === 'dark' ? '#fff' : '#000';
    dom.style.textAlign = node.align;
    dom.style.overflow = 'hidden';
    if (node.lineLimit === 1) {
      dom.style.whiteSpace = 'nowrap';
      dom.style.textOverflow = 'ellipsis';
    } else if (node.lineLimit > 1) {
      dom.style.display = '-webkit-box';
      dom.style.webkitBoxOrient = 'vertical';
      dom.style.webkitLineClamp = String(node.lineLimit);
    }
    dom.dataset.size = String(font.size);
    dom.dataset.scale = String(node.minimumScaleFactor ?? 1);
    dom.dataset.lines = String(node.lineLimit);
    dom.style.flex = '0 1 auto';
    dom.style.minWidth = '0';
    dom.style.maxWidth = '100%';
    return dom;
  }
  if (node.type === 'image') {
    const { width, height } = node.imageSize ?? node.image.size;
    let dom;
    if (node.image.kind === 'symbol') {
      dom = document.createElement('span');
      dom.innerHTML = `<svg viewBox="0 0 24 24" width="${width}" height="${height}">${SYMBOLS[node.image.name] ?? SYMBOLS['circle.fill']}</svg>`;
      dom.style.color = node.tintColor ? node.tintColor.css(theme) : 'currentColor';
      dom.style.display = 'inline-flex';
    } else {
      dom = document.createElement('img');
      dom.src = node.image.dataUrl ?? '';
    }
    dom.style.width = `${width}px`;
    dom.style.height = `${height}px`;
    dom.style.flex = '0 0 auto';
    dom.style.opacity = String(node.imageOpacity ?? 1);
    return dom;
  }
  // A stack.
  const dom = document.createElement('div');
  dom.style.display = 'flex';
  dom.style.flexDirection = node.layout === 'horizontal' ? 'row' : 'column';
  dom.style.gap = `${node.spacing}px`;
  dom.style.alignItems =
    node.layout === 'horizontal' ? { top: 'flex-start', center: 'center', bottom: 'flex-end' }[node.align] : 'center';
  const [t, l, b, r] = node.padding;
  dom.style.padding = `${t}px ${r}px ${b}px ${l}px`;
  if (node.size.width > 0) dom.style.width = `${node.size.width}px`;
  if (node.size.height > 0) dom.style.height = `${node.size.height}px`;
  if (node.backgroundColor) dom.style.background = node.backgroundColor.css(theme);
  if (node.cornerRadius) dom.style.borderRadius = `${node.cornerRadius}px`;
  node.children.forEach((child, i) => {
    const childDom = renderNode(child, theme, node.layout, node._kids[i]);
    if (child.type === 'stack') styleAsChild(childDom, node._kids[i], node.layout);
    if (child.type === 'stack' && node.size.width > 0 && node.layout === 'vertical') childDom.style.alignSelf = 'stretch';
    dom.appendChild(childDom);
  });
  if (node.size.width > 0) dom.style.flex = '0 0 auto';
  return dom;
}

/** The widget as a fixed-size element (`family` decides the size and the lock screen look). */
export function renderWidget(widget, family, theme) {
  const [width, height] = FRAMES[family];
  const lock = family.startsWith('accessory');
  const frame = document.createElement('div');
  frame.className = `widget ${family}`;
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.setProperty('--cut', lock ? '#1b2433' : theme === 'dark' ? '#1C1C1E' : '#FFFFFF');
  const root = { type: 'stack', layout: 'vertical', children: widget.children, spacing: widget.spacing ?? 0, size: { width: 0, height: 0 } };
  measure(root);
  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.alignItems = 'center';
  body.style.justifyContent = 'center';
  body.style.width = '100%';
  body.style.height = '100%';
  body.style.boxSizing = 'border-box';
  const padding = widget.padding ?? (lock ? [0, 0, 0, 0] : [16, 16, 16, 16]);
  body.style.padding = `${padding[0]}px ${padding[3]}px ${padding[2]}px ${padding[1]}px`;
  if (!lock && widget.backgroundColor) frame.style.background = widget.backgroundColor.css(theme);
  if (widget.addAccessoryWidgetBackground) frame.style.background = 'rgba(255,255,255,0.16)';
  if (widget.backgroundImage) {
    body.style.backgroundImage = `url(${widget.backgroundImage.dataUrl})`;
    body.style.backgroundSize = '100% 100%';
  }
  widget.children.forEach((child, i) => {
    const dom = renderNode(child, theme, 'vertical', root._kids[i]);
    if (child.type === 'stack') styleAsChild(dom, root._kids[i], 'vertical');
    body.appendChild(dom);
  });
  frame.appendChild(body);
  return frame;
}

/** After the element is in the page: shrink overflowing text down to its minimumScaleFactor. */
export function fitTexts(container) {
  const range = document.createRange();
  // Fractional widths: scrollWidth is rounded and lets a cut-off text pass for a fitting one.
  const fits = (dom) => {
    range.selectNodeContents(dom);
    return range.getBoundingClientRect().width <= dom.getBoundingClientRect().width + 0.01;
  };
  for (const dom of container.querySelectorAll('[data-scale]')) {
    const size = Number(dom.dataset.size);
    const scale = Number(dom.dataset.scale);
    if (scale >= 1 || dom.dataset.lines !== '1' || fits(dom)) continue;
    let low = size * scale;
    let high = size;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      dom.style.fontSize = `${mid}px`;
      if (fits(dom)) low = mid;
      else high = mid;
    }
    dom.style.fontSize = `${low}px`;
  }
}
