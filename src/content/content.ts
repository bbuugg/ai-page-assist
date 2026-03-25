import { hideAICursor, showAICursorIdle, showScanEffect } from './ai-effects';
import { handleToolMessage } from './tool-handlers';

let sessionActive = false;
let lastElementData: { html: string; css: string } | null = null;
let speechMsgListenerAttached = false;

const HIGHLIGHT_CLASS = 'ai-extension-highlight-element';

// ---- DOM modification undo stack ----
type UndoSnapshot = { node: Element; html: string; style: string }[];
let lastUndoSnapshot: UndoSnapshot | null = null;

function applyUndoSnapshot(snapshot: UndoSnapshot) {
  for (const { node, html, style } of snapshot) {
    const tmp = document.createElement('template');
    tmp.innerHTML = html;
    const restored = tmp.content.firstElementChild as HTMLElement | null;
    if (restored) {
      node.replaceWith(restored);
    } else {
      // fallback: just restore inline style
      (node as HTMLElement).setAttribute('style', style);
    }
  }
}

// ---- Message listener from background / side panel ----
// Clean up AI visual effects when page is restored from BFCache
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    sessionActive = false;
    const scanEl = document.getElementById('ai-fx-scan');
    if (scanEl) scanEl.remove();
    hideAICursor();
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const { action } = request;

  if (action === 'showBorderFx') {
    sessionActive = true;
    showScanEffect(true);
    showAICursorIdle();
    return false;
  }
  if (action === 'hideBorderFx') {
    sessionActive = false;
    const el = document.getElementById('ai-fx-scan');
    if (el) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' })
        .onfinish = () => el.remove();
    }
    // Keep cursor alive so it can animate smoothly to the next target
    return false;
  }
  if (action === 'destroyFx') {
    sessionActive = false;
    const el = document.getElementById('ai-fx-scan');
    if (el) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' })
        .onfinish = () => el.remove();
    }
    hideAICursor();
    return false;
  }

  if (action === 'SPEECH_START' || action === 'SPEECH_STOP') {
    // Attach postMessage listener once to relay MAIN world speech events back to panel
    // Use window flag to prevent duplicate listeners across multiple content script instances
    const win = window as typeof window & { __aiSpeechListenerAttached?: boolean };
    if (!speechMsgListenerAttached && !win.__aiSpeechListenerAttached) {
      speechMsgListenerAttached = true;
      win.__aiSpeechListenerAttached = true;
      window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        if (!e.data?.__aiSpeech) return;
        console.log('[AI Speech] content got message:', e.data);
        try {
          if (e.data.__aiSpeech === 'result') {
            chrome.runtime.sendMessage({ action: 'toPanel', payload: { type: 'SPEECH_RESULT', transcript: e.data.transcript } }).catch(() => {});
          } else if (e.data.__aiSpeech === 'end') {
            chrome.runtime.sendMessage({ action: 'toPanel', payload: { type: 'SPEECH_END', error: e.data.error } }).catch(() => {});
          }
        } catch (err) {
          console.error('[AI Speech] relay error:', err);
        }
      });
    }
    // Actual SpeechRecognition runs in background via executeScript(world:MAIN) — nothing more to do here
    return false;
  }

  // Tool calls forwarded from side panel via background — respond via sendResponse
  if (action === 'tool') {
    const { tool, input } = request;
    (async () => {
      await handleToolMessage(tool, input, sendResponse, {
        getLastElementData: () => lastElementData,
        setUndoSnapshot: (snapshot) => { lastUndoSnapshot = snapshot; },
        getUndoSnapshot: () => lastUndoSnapshot,
        applyUndoSnapshot,
        highlightClass: HIGHLIGHT_CLASS,
        isSessionActive: () => sessionActive,
      });
    })();
    return true; // keep message channel open for async sendResponse
  }
});

// Clean up any leftover elements from a previous content script instance
(function cleanup() {
  document.getElementById('ai-fx-cursor')?.remove();
  document.getElementById('ai-fx-scan')?.remove();
  document.getElementById('ai-fx-scan-style')?.remove();
})();
