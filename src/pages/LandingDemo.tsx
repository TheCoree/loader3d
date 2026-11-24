import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The editor's picture under the hero and the way into the demo (pages/DemoPage, `/demo`). On wide screens the
 * picture grows while the page scrolls through this block — to the edges of a laptop screen, to a big window
 * (MAX_W) on a wide monitor — and «Открыть демо» comes up on it (pointing at the picture shows it too); a click grows it the rest of the way and the demo
 * opens on the same picture. Phones and narrow windows get the picture only, as before.
 *
 * Prerendered with the landing page: the server and the first render in the browser give the same markup (the
 * sizes come from CSS until the script takes over), nothing touches window or document while rendering, and the
 * demo's code (the editor, three.js) loads only once the visitor scrolls into the block or points at the picture.
 */

const SHOT = { src: '/landing/editor.webp', width: 2400, height: 1500 };
const ALT = 'Редактор Loader3D: еврофура с местами в кузове и на доке, размеры кузова, список грузов и статистика';

/** The demo is offered where Tailwind's `lg` starts. */
const WIDE = '(min-width: 1024px)';
/** The sticky header of the landing page, px. */
const HEADER = 64;
/** The window bar above the picture, px. */
const BAR = 40;
/**
 * The widest the picture grows, px. It is a screenshot of the editor 1200 px wide (2400 at 2x): much larger and its
 * interface looks oversized, so on wide monitors it grows to a big window, not to the edges of the screen.
 */
const MAX_W = 1440;
/** From this share of the way «Открыть демо» is on the picture. */
const OFFER_AT = 0.5;

/** The demo's code (the same chunk the route loads). */
function loadDemo() {
  return import('./DemoPage');
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Grows a copy of the picture from where it is to the whole screen, then calls `done` (the demo opens under it,
 * on the same picture, and the copy fades away). Without animations — at once.
 */
function growToScreen(from: HTMLElement, done: () => void): void {
  const rect = from.getBoundingClientRect();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof from.animate !== 'function') {
    done();
    return;
  }
  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed',
    zIndex: '100',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    background: `#0a0a0a url(${SHOT.src}) left top / cover no-repeat`,
    pointerEvents: 'none',
  });
  document.body.appendChild(ghost);
  const grow = ghost.animate(
    [
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
      { left: '0px', top: '0px', width: `${window.innerWidth}px`, height: `${window.innerHeight}px` },
    ],
    { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' },
  );
  grow.onfinish = () => {
    done();
    const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, delay: 120, easing: 'ease-out', fill: 'forwards' });
    fade.onfinish = () => ghost.remove();
  };
}

/** A plain click (not one that opens a new tab or window). */
const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export function LandingDemo() {
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLDivElement>(null);

  // Sizes follow the scroll through style properties and data attributes (no React render per frame): read and
  // written once a frame (requestAnimationFrame), only while the block is near the screen, and only when they change.
  useEffect(() => {
    const el = wrap.current;
    const box = frame.current;
    if (!el || !box) return;
    const media = window.matchMedia(WIDE);
    let raf = 0;
    let last = '';
    let preloaded = false;
    // The demo's code (the editor, three.js) once the visitor scrolls in, when the browser is idle: not in the
    // middle of a scrolled frame.
    const preload = () => {
      if (preloaded) return;
      preloaded = true;
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => void loadDemo(), { timeout: 2000 });
      else window.setTimeout(() => void loadDemo(), 200);
    };
    const update = () => {
      raf = 0;
      if (!media.matches) {
        delete box.dataset.grow;
        delete box.dataset.offer;
        last = '';
        return;
      }
      const vw = el.clientWidth;
      const boxH = window.innerHeight - HEADER;
      const rect = el.getBoundingClientRect();
      const travel = Math.max(1, rect.height - boxH);
      // Grows all the way the block is pinned, at an even pace: no slowing down at the end, so the page does not
      // seem to stick before the picture scrolls on.
      const p = clamp01((HEADER - rect.top) / travel);
      const startW = Math.min(1152, vw - 48, (boxH - BAR - 48) * 1.6);
      const startH = startW / 1.6 + BAR;
      // To the edges of the screen (no window bar, no corners) where that keeps the picture near its own size.
      const endW = Math.min(vw, MAX_W);
      const edges = endW >= vw;
      const endBar = edges ? 0 : BAR;
      const endH = Math.min(boxH, endW / 1.6 + endBar);
      const w = Math.round(startW + (endW - startW) * p);
      const h = Math.round(startH + (endH - startH) * p);
      const r = Math.round((edges ? 12 * (1 - p) : 12) * 10) / 10;
      const bar = Math.round(BAR + (endBar - BAR) * p);
      const offer = p >= OFFER_AT;
      if (p > 0.05) preload();
      const key = `${w}|${h}|${r}|${bar}|${offer}`;
      if (key === last) return;
      last = key;
      box.dataset.grow = '';
      box.style.setProperty('--w', `${w}px`);
      box.style.setProperty('--h', `${h}px`);
      box.style.setProperty('--r', `${r}px`);
      box.style.setProperty('--bar', `${bar}px`);
      if (offer) box.dataset.offer = '';
      else delete box.dataset.offer;
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    let following = false;
    const follow = (on: boolean) => {
      if (on === following) return;
      following = on;
      if (on) window.addEventListener('scroll', schedule, { passive: true });
      else window.removeEventListener('scroll', schedule);
    };
    const near = new IntersectionObserver(
      ([entry]) => {
        follow(entry.isIntersecting);
        schedule();
      },
      { rootMargin: '25% 0px' },
    );
    near.observe(el);
    update();
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    return () => {
      near.disconnect();
      follow(false);
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
    };
  }, []);

  return (
    <section data-section="demo" className="relative">
      <div ref={wrap} className="relative lg:h-[160vh]">
        <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:max-w-none lg:items-center lg:justify-center lg:overflow-hidden lg:px-0">
          <div
            ref={frame}
            onPointerEnter={() => void loadDemo()}
            style={{ '--w': 'min(1152px, calc(100% - 48px), calc((100dvh - 4rem - 88px) * 1.6))' } as CSSProperties}
            className={cn(
              'group/frame landing-rise relative flex flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[#0a0a0a] [contain:layout_paint] [animation-delay:260ms]',
              'lg:w-(--w) lg:shrink-0 lg:data-grow:h-(--h) lg:data-grow:rounded-(--r)',
            )}
          >
            <div className="relative h-10 shrink-0 overflow-hidden border-b border-white/[0.08] lg:group-data-grow/frame:h-(--bar)">
              <div className="flex h-10 items-center gap-1.5 px-4">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="absolute inset-x-0 text-center text-xs text-white/40">loader3d.pro — Рейс Москва — Казань</span>
              </div>
            </div>
            <div
              ref={shot}
              className="relative aspect-[8/5] w-full lg:group-data-grow/frame:aspect-auto lg:group-data-grow/frame:min-h-0 lg:group-data-grow/frame:flex-1"
            >
              <img
                src={SHOT.src}
                width={SHOT.width}
                height={SHOT.height}
                alt={ALT}
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 size-full object-cover object-left-top"
              />
              {/* Wide screens only: «Открыть демо» over the picture once it has grown (or under the pointer). */}
              <Link
                to="/demo"
                data-track="showcase_demo"
                aria-label="Открыть демо редактора — без регистрации"
                onFocus={() => void loadDemo()}
                onClick={(e) => {
                  if (!plainClick(e) || !shot.current) return;
                  e.preventDefault();
                  growToScreen(shot.current, () => navigate('/demo'));
                }}
                className={cn(
                  'absolute inset-0 hidden place-items-center bg-black/55 opacity-0 transition-opacity duration-300 outline-none lg:grid',
                  'group-hover/frame:opacity-100 group-data-offer/frame:opacity-100 focus-visible:opacity-100',
                )}
              >
                <span className="flex flex-col items-center gap-3 px-4 text-center">
                  <span className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ededed] px-6 text-base font-medium text-[#0a0a0a] transition-transform duration-300 group-hover/frame:scale-105">
                    <MousePointerClick className="size-[18px]" strokeWidth={2} />
                    Открыть демо
                    <ArrowRight className="size-4" />
                  </span>
                  <span className="text-sm text-white/80">Без регистрации — потяните груз, нажмите «Автозагрузка»</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
