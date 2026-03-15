let isSelecting = false;
let isEditingText = false;
let hoveredElement = null;
let lastSelectedElement = null;
let overlayRoot = null;
let currentPreviewTab = 'html';
let lastSelectedBackendNodeId = null;

const HIGHLIGHT_CLASS = 'ai-extension-highlight-element';

// --- HTML Format Utilities --- //
function formatHTML(html) {
  if (!html) return '';
  const tab = '  ';
  let formatted = '';
  let indentLevel = 0;

  // Use DOMParser so the browser handles all attribute edge cases correctly
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Find the actual root element: DOMParser wraps in <html><body>, so pick the first child of body
  // (or head if that's where it ended up)
  let root = doc.body.firstElementChild || doc.head.firstElementChild;
  if (!root) return html;

  function serializeNode(node, depth) {
    const indent = tab.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text.trim()) formatted += text.trim();
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const voidElements = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];
    const tag = node.tagName.toLowerCase();
    const isVoid = voidElements.includes(tag);

    // Build opening tag with attributes
    let openTag = `<${tag}`;
    for (const attr of node.attributes) {
      openTag += ` ${attr.name}="${attr.value}"`;
    }
    openTag += isVoid ? ' />' : '>';

    if (formatted.length > 0) formatted += '\n';
    formatted += indent + openTag;

    if (!isVoid) {
      const children = Array.from(node.childNodes).filter(n =>
        n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
      );
      if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
        // Inline text content
        formatted += children[0].textContent.trim() + `</${tag}>`;
      } else {
        children.forEach(child => serializeNode(child, depth + 1));
        if (children.length > 0) formatted += '\n' + indent;
        formatted += `</${tag}>`;
      }
    }
  }

  serializeNode(root, 0);
  return formatted.trim() || html;
}

function minifyHTML(html) {
  return html.replace(/\n|(?:\s{2,})/g, ' ').replace(/>\s*</g, '><').trim();
}

function formatCSS(cssText) {
  if (!cssText) return '';
  return cssText.split(';').filter(s => s.trim()).map(s => '  ' + s.trim() + ';').join('\n');
}

function minifyCSS(cssText) {
  if (!cssText) return '';
  return cssText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

// Ensure overlay doesn't catch its own clicks during selection
function isInsideOverlay(element) {
  return overlayRoot && overlayRoot.contains(element);
}

function handleMouseOver(e) {
  if (!isSelecting) return;
  if (isInsideOverlay(e.target)) return;
  e.stopPropagation();
  hoveredElement = e.target;
  hoveredElement.classList.add(HIGHLIGHT_CLASS);
}

function handleMouseOut(e) {
  if (!isSelecting) return;
  if (isInsideOverlay(e.target)) return;
  e.stopPropagation();
  if (hoveredElement) {
    hoveredElement.classList.remove(HIGHLIGHT_CLASS);
  }
}

function handleClick(e) {
  if (!isSelecting) return;
  if (isInsideOverlay(e.target)) return;

  e.preventDefault();
  e.stopPropagation();
  
  const target = e.target;
  target.classList.remove(HIGHLIGHT_CLASS);
  
  lastSelectedElement = target;
  console.log("[AI Page Inspector] Requesting deep inspection via Debugger...");

  // Show loading state
  showExtractedHtml("<!-- Loading full details via Debugger... -->");
  const cssTextarea = document.getElementById('ai-css-textarea');
  if (cssTextarea) cssTextarea.value = "/* Loading styles... */";

  // Request high-fidelity data from background debugger
  chrome.runtime.sendMessage({ 
    action: "inspectElement", 
    x: e.clientX, 
    y: e.clientY 
  }, (response) => {
    if (response && response.error) {
       addChatMessage("Debugger Error: " + response.error, 'system');
       // Fallback to basic extraction
       showExtractedHtml(target.outerHTML);
    } else if (response) {
       lastSelectedBackendNodeId = response.backendNodeId;
       displayDebuggerResults(response.html, response.css);
    }
  });

  disableSelection();
  addChatMessage(`Inspecting element: <${target.tagName.toLowerCase()}>`, 'system');
}

function displayDebuggerResults(html, css) {
  const preview = document.getElementById('ai-html-preview');
  const htmlTextarea = document.getElementById('ai-html-textarea');
  const cssTextarea = document.getElementById('ai-css-textarea');
  const charTracker = document.getElementById('ai-char-count');

  if (preview && htmlTextarea && cssTextarea) {
    // 1. Handle HTML
    const formattedHtml = formatHTML(html);
    htmlTextarea.value = formattedHtml;

    // 2. Handle CSS
    cssTextarea.value = css || "/* No styles found */";

    // 3. Update counter
    const text = currentPreviewTab === 'html' ? htmlTextarea.value : cssTextarea.value;
    if (charTracker) charTracker.innerText = `(${text.length} chars)`;

    preview.classList.add('show');
  }
}

function enableSelection() {
  if (isSelecting) return;
  isSelecting = true;
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handleClick, true);
  
  const btn = document.getElementById('ai-btn-select');
  if (btn) {
    btn.classList.add('active');
    btn.innerText = 'Selecting...';
  }
}

function disableSelection() {
  if (!isSelecting) return;
  isSelecting = false;
  if (hoveredElement) {
    hoveredElement.classList.remove(HIGHLIGHT_CLASS);
    hoveredElement = null;
  }
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('mouseout', handleMouseOut, true);
  document.removeEventListener('click', handleClick, true);
  
  const btn = document.getElementById('ai-btn-select');
  if (btn) {
    btn.classList.remove('active');
    btn.innerText = 'Select Element';
  }
}

// --- Text Editing Logic --- //

function handleTextEditClick(e) {
  if (!isEditingText) return;
  if (isInsideOverlay(e.target)) return;

  // Stop interactivity (like link navigation or custom JS clicks) 
  // while allowing native mousedown/mouseup to place the text cursor.
  e.stopPropagation();
  e.preventDefault();
}

function enableTextEditing() {
  if (isEditingText) return;
  isEditingText = true;
  document.designMode = "on";
  document.addEventListener('click', handleTextEditClick, true);
  
  const btn = document.getElementById('ai-btn-edit-text');
  if (btn) btn.classList.add('active');
}

function disableTextEditing() {
  if (!isEditingText) return;
  isEditingText = false;
  if (document.designMode === "on") document.designMode = "off";
  document.removeEventListener('click', handleTextEditClick, true);
  
  const btn = document.getElementById('ai-btn-edit-text');
  if (btn) btn.classList.remove('active');
}

// --- UI Management --- //

function createOverlay() {
  if (document.getElementById('ai-inspector-overlay-root')) return;

  overlayRoot = document.createElement('div');
  overlayRoot.id = 'ai-inspector-overlay-root';
  overlayRoot.setAttribute('contenteditable', 'false'); // Ensure UI doesn't become editable string designMode
  
  overlayRoot.innerHTML = `
    <!-- Extracted HTML Preview (Top) -->
    <div id="ai-html-preview" class="ai-glass">
      <div id="ai-html-preview-header">
        <div id="ai-view-tabs">
          <button id="ai-tab-html" class="ai-tab-btn active">HTML</button>
          <button id="ai-tab-css" class="ai-tab-btn">CSS</button>
          <span id="ai-char-count" style="color: rgba(255,255,255,0.5); font-weight: normal; margin-left: 8px; font-size: 11px;"></span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="ai-btn-save" class="ai-icon-btn" title="Save changes to page">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          </button>
          <button id="ai-btn-copy" class="ai-icon-btn" title="Copy to clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button id="ai-btn-close-preview" class="ai-icon-btn" title="Close preview">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      <textarea id="ai-html-textarea" placeholder="No element selected"></textarea>
      <textarea id="ai-css-textarea" placeholder="Inline CSS styles..." style="display: none;"></textarea>
    </div>

    <!-- Main Chat Container (Bottom) -->
    <div id="ai-chat-container" class="ai-glass">
      <div id="ai-chat-header">
        <div id="ai-chat-title">
          <div class="ai-status-dot"></div>
          AI Page Inspector
        </div>
        <div id="ai-chat-controls">
          <button id="ai-btn-select" class="ai-tool-btn">Select Element</button>
          <button id="ai-btn-edit-text" class="ai-tool-btn">Edit Text</button>
          <button id="ai-btn-full" class="ai-tool-btn">Full HTML</button>
          <button id="ai-btn-close-all" class="ai-icon-btn" style="margin-left: 4px;" title="Close Inspector">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      
      <div id="ai-chat-messages">
        <div class="ai-message assistant">Hello! I'm ready to inspect the page. You can select elements to examine them or tell me to modify the page.</div>
      </div>

      <div id="ai-chat-input-area">
        <input type="text" id="ai-chat-input" placeholder="Ask AI to modify the selected element..." autocomplete="off">
        <button id="ai-send-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlayRoot);

  // Setup Event Listeners
  document.getElementById('ai-btn-select').addEventListener('click', () => {
    if (isSelecting) {
      disableSelection();
    } else {
      enableSelection();
    }
  });

  document.getElementById('ai-btn-edit-text').addEventListener('click', () => {
    if (isEditingText) {
      disableTextEditing();
    } else {
      enableTextEditing();
    }
  });

  document.getElementById('ai-btn-full').addEventListener('click', () => {
    if (isSelecting) disableSelection();
    showExtractedHtml(document.documentElement.outerHTML);
    addChatMessage(`Captured full page HTML.`, 'system');
  });

  document.getElementById('ai-btn-close-preview').addEventListener('click', () => {
    document.getElementById('ai-html-preview').classList.remove('show');
  });

  document.getElementById('ai-tab-html').addEventListener('click', () => {
    currentPreviewTab = 'html';
    document.getElementById('ai-tab-html').classList.add('active');
    document.getElementById('ai-tab-css').classList.remove('active');
    document.getElementById('ai-html-textarea').style.display = 'block';
    document.getElementById('ai-css-textarea').style.display = 'none';
    const text = document.getElementById('ai-html-textarea').value;
    document.getElementById('ai-char-count').innerText = `(${text.length} chars)`;
  });

  document.getElementById('ai-tab-css').addEventListener('click', () => {
    currentPreviewTab = 'css';
    document.getElementById('ai-tab-css').classList.add('active');
    document.getElementById('ai-tab-html').classList.remove('active');
    document.getElementById('ai-css-textarea').style.display = 'block';
    document.getElementById('ai-html-textarea').style.display = 'none';
    const text = document.getElementById('ai-css-textarea').value;
    document.getElementById('ai-char-count').innerText = `(${text.length} chars)`;
  });

  document.getElementById('ai-btn-save').addEventListener('click', () => {
    if (!lastSelectedBackendNodeId) {
      addChatMessage("No element tracked by debugger. Try re-selecting.", 'system');
      return;
    }
    
    const value = currentPreviewTab === 'html' 
      ? document.getElementById('ai-html-textarea').value 
      : document.getElementById('ai-css-textarea').value;
    
    if (!value) return;

    chrome.runtime.sendMessage({
      action: "saveChanges",
      backendNodeId: lastSelectedBackendNodeId,
      type: currentPreviewTab,
      value: value
    }, (response) => {
      if (response && response.error) {
        addChatMessage("Save Error: " + response.error, 'system');
      } else {
        addChatMessage(`Successfully updated element ${currentPreviewTab.toUpperCase()} via Debugger.`, 'system');
        
        // Flash success UI
        const btn = document.getElementById('ai-btn-save');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => btn.innerHTML = originalHtml, 2000);
      }
    });
  });

  document.getElementById('ai-btn-copy').addEventListener('click', () => {
    const text = currentPreviewTab === 'html' 
      ? document.getElementById('ai-html-textarea').value 
      : document.getElementById('ai-css-textarea').value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('ai-btn-copy');
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => btn.innerHTML = originalHtml, 2000);
    });
  });

  document.getElementById('ai-btn-close-all').addEventListener('click', toggleOverlay);

  const chatInput = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-send-btn');

  const sendMessage = () => {
    const text = chatInput.value.trim();
    if (text) {
      addChatMessage(text, 'user');
      chatInput.value = '';
      
      // Stub for actual AI interaction
      setTimeout(() => {
        addChatMessage("I'm a placeholder for the future AI integration. I saw your message: " + text, 'assistant');
      }, 500);
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Force reflow and show
  requestAnimationFrame(() => {
    overlayRoot.classList.add('show');
  });
}

function showExtractedHtml(html) {
  const preview = document.getElementById('ai-html-preview');
  const htmlTextarea = document.getElementById('ai-html-textarea');
  const cssTextarea = document.getElementById('ai-css-textarea');
  const charTracker = document.getElementById('ai-char-count');
  
  if (preview && htmlTextarea && cssTextarea) {
    // Populate HTML
    const formattedHtml = formatHTML(html);
    htmlTextarea.value = formattedHtml;
    
    // CSS is handled separately by the debugger for single elements.
    // For full-page HTML, we just clear it or show a placeholder.
    if (html.startsWith('<!DOCTYPE') || html.startsWith('<html')) {
       cssTextarea.value = "/* CSS inspection is only available for individual elements. */";
    }
    
    // Update char counter based on current tab
    const text = currentPreviewTab === 'html' ? htmlTextarea.value : cssTextarea.value;
    if (charTracker) charTracker.innerText = `(${text.length} chars)`;
    
    preview.classList.add('show');
  }
}

function addChatMessage(text, sender) {
  const messagesContainer = document.getElementById('ai-chat-messages');
  if (!messagesContainer) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-message ${sender}`;
  msgDiv.innerText = text;
  
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function toggleOverlay() {
  if (!overlayRoot) {
    createOverlay();
  } else {
    if (overlayRoot.classList.contains('show')) {
      overlayRoot.classList.remove('show');
      disableSelection();
      
      // Cleanup text editing if left on
      disableTextEditing();
      
      // Wait for transition before removing
      setTimeout(() => {
        if (overlayRoot) {
          overlayRoot.remove();
          overlayRoot = null;
        }
      }, 400);
    } else {
      overlayRoot.classList.add('show');
    }
  }
}

// Background script messenger listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleOverlay") {
    toggleOverlay();
    sendResponse({ status: "overlay_toggled" });
  }
  return true;
});

// Cleanup selection if extension unloads or tab closes
window.addEventListener("pagehide", () => {
  disableSelection();
  disableTextEditing();
});
