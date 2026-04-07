/* global chrome */
const PENDING_KEY = 'pendingNotebookLMUpload';
const MAX_ATTEMPTS = 48;
const STEP_MS = 450;

function walkDepthFirst(root, visit) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      visit(node);
      if (node.shadowRoot) {
        stack.push(node.shadowRoot);
      }
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  }
}

function collectFileInputs() {
  const found = [];
  walkDepthFirst(document.documentElement, (el) => {
    if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file') {
      found.push(el);
    }
  });
  return found;
}

function normText(el) {
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

function normAria(el) {
  return ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
}

function isClickable(el) {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.disabled) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
    return false;
  }
  return true;
}

function tryClickUploadPath() {
  const candidates = [];
  walkDepthFirst(document.documentElement, (el) => {
    if (!(el instanceof HTMLElement) || !isClickable(el)) {
      return;
    }
    const tag = el.tagName;
    const role = el.getAttribute('role');
    if (tag !== 'BUTTON' && role !== 'button' && role !== 'menuitem' && role !== 'tab' && tag !== 'A') {
      return;
    }
    const aria = normAria(el);
    const text = normText(el);
    const hay = `${aria} ${text}`;
    if (
      hay.includes('upload') ||
      hay.includes('yükle') ||
      hay.includes('local file') ||
      hay.includes('from computer') ||
      hay.includes('bilgisayar') ||
      hay.includes('dosya') ||
      (hay.includes('file') && (hay.includes('add') || hay.includes('import')))
    ) {
      candidates.push(el);
    }
  });
  for (const el of candidates) {
    el.click();
    return true;
  }
  return false;
}

function tryClickAddSource() {
  const candidates = [];
  walkDepthFirst(document.documentElement, (el) => {
    if (!(el instanceof HTMLElement) || !isClickable(el)) {
      return;
    }
    const tag = el.tagName;
    const role = el.getAttribute('role');
    if (tag !== 'BUTTON' && role !== 'button' && role !== 'menuitem') {
      return;
    }
    const aria = normAria(el);
    const text = normText(el);
    if (
      (aria.includes('add') && (aria.includes('source') || aria.includes('kaynak'))) ||
      (text === 'add' || text.startsWith('add ') || text.includes('add source')) ||
      (aria.includes('insert') && aria.includes('source'))
    ) {
      candidates.push(el);
    }
  });
  for (const el of candidates) {
    el.click();
    return true;
  }
  return false;
}

function pickFileInput(inputs) {
  if (!inputs.length) {
    return null;
  }
  const withMultiple = inputs.filter((i) => i.multiple);
  if (withMultiple.length) {
    return withMultiple[0];
  }
  return inputs[0];
}

function setInputFiles(input, files) {
  const dt = new DataTransfer();
  for (const f of files) {
    dt.items.add(f);
  }
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
  if (desc && desc.set) {
    desc.set.call(input, dt.files);
  } else {
    input.files = dt.files;
  }
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadPending() {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const pending = data[PENDING_KEY];
  if (!pending || !Array.isArray(pending.files) || pending.files.length === 0) {
    return null;
  }
  return pending;
}

async function clearPending() {
  await chrome.storage.local.remove(PENDING_KEY);
}

async function runImport() {
  const pending = await loadPending();
  if (!pending) {
    return { ok: false, error: 'Yüklenecek dosya kuyrugu bos. Once extension popup ile repoyu isleyin.' };
  }

  const fileObjects = pending.files.map(
    (item) => new File([item.content], item.filename, { type: 'text/plain', lastModified: Date.now() })
  );

  let addClicked = false;
  let uploadClicked = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const inputs = collectFileInputs();
    const input = pickFileInput(inputs);
    if (input) {
      try {
        setInputFiles(input, fileObjects);
        await clearPending();
        return {
          ok: true,
          uploaded: fileObjects.length
        };
      } catch (e) {
        return { ok: false, error: `Dosya inputuna yazilamadi: ${e && e.message ? e.message : String(e)}` };
      }
    }

    if (attempt % 5 === 2 && !addClicked) {
      addClicked = tryClickAddSource();
    }
    if (attempt % 5 === 3 && !uploadClicked) {
      uploadClicked = tryClickUploadPath();
    }
    if (attempt === 10) {
      tryClickAddSource();
    }
    if (attempt === 14) {
      tryClickUploadPath();
    }

    await sleep(STEP_MS);
  }

  return {
    ok: false,
    error:
      'NotebookLM yukleme alani bulunamadi. Bir not defteri acik oldugundan emin olun, Kaynaklar > Ekle akisini manuel acip tekrar deneyin. Google arayuzunu guncellediyse seciciler guncellenmeli.'
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'GITNOTEBOOK_IMPORT_START') {
    runImport()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
    return true;
  }
  return false;
});
