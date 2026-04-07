// background.js - Service Worker for GitHub to NotebookLM extension

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadFiles') {
    handleDownloadFiles(message.files, message.repoName)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

async function handleDownloadFiles(files, repoName) {
  // Download each processed .txt file
  for (const file of files) {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url,
          filename: `${repoName}/${file.filename}`,
          saveAs: false,
          conflictAction: 'overwrite'
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
          URL.revokeObjectURL(url);
        }
      );
    });

    // Small delay between downloads
    await new Promise(r => setTimeout(r, 50));
  }
}
