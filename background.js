const NOTEBOOK_URL_PATTERN = '*://notebooklm.google.com/*';
const NOTEBOOK_HOME = 'https://notebooklm.google.com/';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }
      if (tab && tab.status === 'complete') {
        resolve();
        return;
      }
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function ensureNotebookTab() {
  const tabs = await chrome.tabs.query({ url: NOTEBOOK_URL_PATTERN });
  const usable = tabs.find((t) => !t.discarded) || tabs[0];
  if (usable) {
    await chrome.tabs.update(usable.id, { active: true });
    return usable;
  }
  const created = await chrome.tabs.create({ url: NOTEBOOK_HOME, active: true });
  await waitTabComplete(created.id);
  await sleep(600);
  return created;
}

async function sendImportToTab(tabId) {
  let lastError = null;
  for (let i = 0; i < 32; i += 1) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'GITNOTEBOOK_IMPORT_START' });
      return result;
    } catch (e) {
      lastError = e;
      await sleep(500);
    }
  }
  throw new Error(
    lastError
      ? String(lastError.message || lastError)
      : 'CONTENT_SCRIPT_TIMEOUT'
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_NOTEBOOKLM_IMPORT') {
    (async () => {
      try {
        const tab = await ensureNotebookTab();
        const result = await sendImportToTab(tab.id);
        sendResponse(result || { ok: false, error: 'Beklenmeyen bos yanit' });
      } catch (e) {
        const msg = String(e?.message || e);
        sendResponse({
          ok: false,
          error:
            msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')
              ? 'NotebookLM sayfasinda icerik betigi yok. Sekmeyi yenileyin veya extensioni yukledikten sonra sayfayi bir kez yenileyin.'
              : msg
        });
      }
    })();
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub to NotebookLM background ready');
});
