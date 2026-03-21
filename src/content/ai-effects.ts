import { ensureElementInViewport, getElementClientPoint, resolveElement } from './dom-utils';

let aiCursorEl: HTMLDivElement | null = null;
let aiCursorBodyEl: HTMLDivElement | null = null;
let aiCursorIdleAnim: Animation | null = null;
let aiCursorMoveAnim: Animation | null = null;
let aiCursorX = 0;
let aiCursorY = 0;
let aiCursorSeq = 0;

function getCursorSvgMarkup(gradientId: string): string {
  return `<style>
    :host {
      display: block;
      width: 48px;
      height: 54px;
    }
    #cursor-body {
      width: 48px;
      height: 54px;
      transform-origin: ${AI_CURSOR_HOTSPOT_X}px ${AI_CURSOR_HOTSPOT_Y}px;
      will-change: transform;
    }
    svg {
      display: block;
      overflow: visible;
    }
  </style>
  <div id="cursor-body">
  <svg width="48" height="54" viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradientId}" x1="4" y1="2" x2="20" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ff2d55"/>
      <stop offset="33%" stop-color="#bf5af2"/>
      <stop offset="66%" stop-color="#007aff"/>
      <stop offset="100%" stop-color="#30d158"/>
    </linearGradient>
  </defs>
  <path d="M5 2L5 26L11 20L15.5 30L18.5 28.5L14 19L21 19L5 2Z"
    fill="rgba(0,0,0,0.55)" stroke="rgba(0,0,0,0.55)" stroke-width="3"
    stroke-linejoin="round"/>
  <path d="M5 2L5 26L11 20L15.5 30L18.5 28.5L14 19L21 19L5 2Z"
    fill="url(#${gradientId})" stroke="rgba(255,255,255,0.9)" stroke-width="1"
    stroke-linejoin="round"/>
  <path d="M22 6 L23.2 9.2 L26.5 10 L23.2 10.8 L22 14 L20.8 10.8 L17.5 10 L20.8 9.2 Z"
    fill="#fff" opacity="0.95"/>
  <path d="M22 6 L23.2 9.2 L26.5 10 L23.2 10.8 L22 14 L20.8 10.8 L17.5 10 L20.8 9.2 Z"
    fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>
  </svg>
  </div>`;
}

const AI_CURSOR_HOTSPOT_X = 7;
const AI_CURSOR_HOTSPOT_Y = 3;

function getCursorBody(cursor: HTMLDivElement): HTMLDivElement | null {
  return cursor.shadowRoot?.getElementById('cursor-body') as HTMLDivElement | null;
}

function setCursorTransform(cursor: HTMLDivElement, x: number, y: number) {
  cursor.style.transform = `translate(${x - AI_CURSOR_HOTSPOT_X}px, ${y - AI_CURSOR_HOTSPOT_Y}px)`;
}

function cancelMoveAnim() {
  if (aiCursorMoveAnim && aiCursorEl) {
    try {
      // commitStyles writes the current animated transform to inline style
      aiCursorMoveAnim.commitStyles();
      const committed = aiCursorEl.style.transform;
      if (committed && committed !== 'none') {
        const m = new DOMMatrixReadOnly(committed);
        aiCursorX = m.m41 + AI_CURSOR_HOTSPOT_X;
        aiCursorY = m.m42 + AI_CURSOR_HOTSPOT_Y;
      }
    } catch {
      // fallback: keep last known position
    }
    aiCursorMoveAnim.cancel();
    aiCursorMoveAnim = null;
  }
}

function createAICursorEl(): HTMLDivElement {
  // Remove any stale cursor element left in the DOM
  document.getElementById('ai-fx-cursor')?.remove();
  const cursor = document.createElement('div');
  cursor.id = 'ai-fx-cursor';
  const shadowRoot = cursor.attachShadow({ mode: 'open' });
  const gradientId = `ai-fx-cur-grad-${Date.now()}-${aiCursorSeq++}`;
  shadowRoot.innerHTML = getCursorSvgMarkup(gradientId);
  Object.assign(cursor.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: '48px',
    height: '54px',
    zIndex: '2147483647',
    pointerEvents: 'none',
    display: 'block',
  });
  document.documentElement.appendChild(cursor);
  aiCursorBodyEl = getCursorBody(cursor);
  const svg = shadowRoot.querySelector('svg');
  if (svg) {
    svg.animate(
      [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(360deg)' }],
      { duration: 3000, iterations: Infinity, easing: 'linear' }
    );
  }
  return cursor;
}

function startIdleAnim(cursor: HTMLDivElement) {
  const body = getCursorBody(cursor);
  if (!body) return;
  aiCursorBodyEl = body;
  if (aiCursorIdleAnim) {
    aiCursorIdleAnim.cancel();
    aiCursorIdleAnim = null;
  }
  body.style.transition = 'none';
  body.style.transform = 'scale(1)';
  aiCursorIdleAnim = body.animate(
    [
      { transform: 'translateY(0px) scale(1)' },
      { transform: 'translateY(-6px) scale(1)' },
      { transform: 'translateY(0px) scale(1)' },
    ],
    { duration: 2200, easing: 'ease-in-out', iterations: Infinity }
  );
}

export function showScanEffect(persistent = false) {
  const existing = document.getElementById('ai-fx-scan');
  if (existing) {
    // Already visible — just ensure it's faded in, no rebuild
    existing.animate([{ opacity: parseFloat(existing.style.opacity) || 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
    return;
  }

  const container = document.createElement('div');
  container.id = 'ai-fx-scan';
  Object.assign(container.style, {
    position: 'fixed', inset: '0', zIndex: '2147483646', pointerEvents: 'none', opacity: '0',
  });

  const durMs = persistent ? 2400 : 1800;
  const iters = persistent ? Infinity : 1;

  function makeEdge(isH: boolean, delay: number) {
    const outer = document.createElement('div');
    Object.assign(outer.style, isH
      ? { position: 'absolute', left: '0', right: '0', height: '3px', overflow: 'hidden' }
      : { position: 'absolute', top: '0', bottom: '0', width: '3px', overflow: 'hidden' }
    );
    const gradH = 'linear-gradient(90deg, transparent 0%, #ff2d55 20%, #bf5af2 40%, #007aff 60%, #30d158 80%, transparent 100%)';
    const gradV = 'linear-gradient(180deg, transparent 0%, #bf5af2 20%, #007aff 40%, #ff2d55 60%, #ffd60a 80%, transparent 100%)';
    const inner = document.createElement('div');
    Object.assign(inner.style, isH
      ? { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', background: gradH }
      : { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', background: gradV }
    );
    inner.animate(
      isH
        ? [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }]
        : [{ transform: 'translateY(-100%)' }, { transform: 'translateY(100%)' }],
      { duration: durMs, iterations: iters, easing: 'linear', delay, fill: 'forwards' }
    );
    outer.appendChild(inner);
    return outer;
  }

  const top = makeEdge(true, 0);
  Object.assign(top.style, { top: '0' });
  const bottom = makeEdge(true, persistent ? 1200 : 900);
  Object.assign(bottom.style, { bottom: '0' });
  const left = makeEdge(false, persistent ? 600 : 450);
  Object.assign(left.style, { left: '0' });
  const right = makeEdge(false, persistent ? 1800 : 1350);
  Object.assign(right.style, { right: '0' });

  container.append(top, bottom, left, right);
  document.documentElement.appendChild(container);
  container.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'forwards' });

  if (!persistent) {
    setTimeout(() => {
      container.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })
        .onfinish = () => container.remove();
    }, 1800);
  }
}

export function hideScanEffect() {
  const el = document.getElementById('ai-fx-scan');
  if (el) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })
      .onfinish = () => el.remove();
  }
}

export function showAICursorIdle() {
  if (aiCursorEl?.isConnected) return;
  if (aiCursorEl && !aiCursorEl.isConnected) {
    // Stale reference — clean up
    aiCursorEl = null;
    aiCursorBodyEl = null;
  }
  const cursor = createAICursorEl();
  aiCursorEl = cursor;
  aiCursorX = window.innerWidth / 2;
  aiCursorY = window.innerHeight / 2;
  setCursorTransform(cursor, aiCursorX, aiCursorY);
  cursor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' }).onfinish = () => {
    cursor.style.opacity = '1';
    if (aiCursorEl === cursor) startIdleAnim(cursor);
  };
}

export function hideAICursor() {
  const cursor = aiCursorEl;
  if (!cursor) return;
  if (aiCursorIdleAnim) { aiCursorIdleAnim.cancel(); aiCursorIdleAnim = null; }
  cancelMoveAnim();
  aiCursorEl = null;
  aiCursorBodyEl = null;
  cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' })
    .onfinish = () => cursor.remove();
}

export function showAICursor(selectorOrEl: string | Element): Promise<void> {
  return new Promise(async (resolve) => {
    const target = selectorOrEl instanceof Element ? selectorOrEl : resolveElement(selectorOrEl);
    if (target) await ensureElementInViewport(target);
    const point = target ? getElementClientPoint(target) : null;
    const targetX = point?.x ?? Math.round(window.innerWidth / 2);
    const targetY = point?.y ?? Math.round(window.innerHeight / 2);

    // Stop any ongoing animations
    if (aiCursorIdleAnim) { aiCursorIdleAnim.cancel(); aiCursorIdleAnim = null; }
    cancelMoveAnim();

    // Create cursor if not present or detached from DOM
    let cursor = aiCursorEl;
    if (!cursor || !cursor.isConnected) {
      cursor = createAICursorEl();
      aiCursorEl = cursor;
      aiCursorX = window.innerWidth / 2;
      aiCursorY = window.innerHeight / 2;
    }

    // Cancel any other animations on the cursor element (e.g. fade-in from showAICursorIdle)
    for (const anim of cursor.getAnimations()) anim.cancel();

    // Ensure cursor is visible and at known position
    cursor.style.opacity = '1';
    setCursorTransform(cursor, aiCursorX, aiCursorY);
    // Force reflow so the browser registers the start position before animating
    cursor.getBoundingClientRect();
    aiCursorBodyEl = getCursorBody(cursor);

    const fromX = aiCursorX;
    const fromY = aiCursorY;
    const moveDuration = 500;

    // Animate move using Web Animations API (reliable, interruptible)
    aiCursorMoveAnim = cursor.animate(
      [
        { transform: `translate(${fromX - AI_CURSOR_HOTSPOT_X}px, ${fromY - AI_CURSOR_HOTSPOT_Y}px)` },
        { transform: `translate(${targetX - AI_CURSOR_HOTSPOT_X}px, ${targetY - AI_CURSOR_HOTSPOT_Y}px)` },
      ],
      { duration: moveDuration, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' }
    );

    aiCursorMoveAnim.onfinish = () => {
      if (aiCursorEl !== cursor) { resolve(); return; }
      // Commit final position
      cursor!.style.transform = `translate(${targetX - AI_CURSOR_HOTSPOT_X}px, ${targetY - AI_CURSOR_HOTSPOT_Y}px)`;
      cursor!.style.opacity = '1';
      aiCursorX = targetX;
      aiCursorY = targetY;
      aiCursorMoveAnim = null;

      // Click press animation on cursor body
      const body = getCursorBody(cursor!);
      if (body) {
        body.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(0.75)' }, { transform: 'scale(1)' }],
          { duration: 200, easing: 'cubic-bezier(0.4,0,0.2,1)' }
        ).onfinish = () => {
          if (aiCursorEl === cursor) startIdleAnim(cursor!);
          resolve();
        };
      } else {
        if (aiCursorEl === cursor) startIdleAnim(cursor!);
        resolve();
      }
    };

    aiCursorMoveAnim.oncancel = () => resolve();
  });
}
