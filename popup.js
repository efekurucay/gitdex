// popup.js - GitHub to NotebookLM Chrome Extension

const BINARY_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','bmp','ico','svg','webp',
  'mp3','mp4','wav','avi','mov','mkv','webm',
  'zip','tar','gz','rar','7z',
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  'exe','dll','so','dylib','bin','dat',
  'woff','woff2','ttf','eot','otf',
  'pyc','class','o','a',
  'lock'
]);

const IGNORE_DIRS = new Set(['.git', '__pycache__', '.DS_Store']);

let allProcessedFiles = []; // { filename: string, content: string }

// --- UI helpers ---
function log(msg, type = 'info') {
  const logContent = document.getElementById('logContent');
  const line = document.createElement('div');
  line.className = `log-${type}`;
  line.textContent = msg;
  logContent.appendChild(line);
  logContent.scrollTop = logContent.scrollHeight;
  document.getElementById('logContainer').classList.remove('hidden');
}

function setProgress(percent, text) {
  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('progressText').textContent = text;
  document.getElementById('progressContainer').classList.remove('hidden');
}

function setButtonLoading(loading) {
  const btn = document.getElementById('startBtn');
  const text = document.getElementById('btnText');
  const spinner = document.getElementById('btnSpinner');
  btn.disabled = loading;
  if (loading) {
    spinner.classList.remove('hidden');
    text.textContent = 'Isleniyor...';
  } else {
    spinner.classList.add('hidden');
    text.textContent = 'Baslat';
  }
}

// --- GitHub API ---
async function fetchGitHubTree(owner, repo, token) {
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;

  // Get default branch
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) throw new Error(`Repo bulunamadi: ${repoRes.status} ${repoRes.statusText}`);
  const repoData = await repoRes.json();
  const branch = repoData.default_branch;

  // Get full tree recursively
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`Tree alinamadi: ${treeRes.status}`);
  const treeData = await treeRes.json();
  return { tree: treeData.tree, branch };
}

async function fetchFileContent(owner, repo, path, token) {
  const headers = { 'Accept': 'application/vnd.github.v3.raw' };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Dosya alinamadi: ${path}`);
  return await res.text();
}

// --- Core processing ---
function isBinaryFile(path) {
  const ext = path.split('.').pop().toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function shouldIgnore(path, ignoreNodeModules, ignoreDotGit) {
  const parts = path.split('/');
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) return true;
    if (ignoreNodeModules && part === 'node_modules') return true;
    if (ignoreDotGit && part === '.git') return true;
  }
  return false;
}

// Group files by their top-level directory (or root)
function groupFilesByDirectory(files) {
  // files: [{ path, content }]
  // Root files: no slash in path -> stay as individual files
  // Subdirectory files: grouped by top-level dir name
  const rootFiles = [];
  const dirMap = {}; // dirName -> [{ path, content }]

  for (const f of files) {
    const slashIdx = f.path.indexOf('/');
    if (slashIdx === -1) {
      // root level file
      rootFiles.push(f);
    } else {
      const dirName = f.path.substring(0, slashIdx);
      if (!dirMap[dirName]) dirMap[dirName] = [];
      dirMap[dirName].push(f);
    }
  }
  return { rootFiles, dirMap };
}

function buildTxtContent(path, content) {
  return `${path}\n${content}`;
}

function buildMergedTxtContent(dirName, files) {
  // Merge all files in a directory into one txt file named after the dir
  return files.map(f => `${f.path}\n${f.content}`).join('\n\n---\n\n');
}

async function processRepo(owner, repo, options) {
  const { token, ignoreNodeModules, ignoreDotGit, ignoreBinaryFiles } = options;

  log(`Repo bilgileri aliniyor: ${owner}/${repo}`, 'info');
  setProgress(5, 'Repo agaci aliniyor...');

  const { tree } = await fetchGitHubTree(owner, repo, token);

  // Filter only blobs (files)
  const allFiles = tree.filter(item => item.type === 'blob');
  const filteredFiles = allFiles.filter(item => {
    if (shouldIgnore(item.path, ignoreNodeModules, ignoreDotGit)) return false;
    if (ignoreBinaryFiles && isBinaryFile(item.path)) return false;
    return true;
  });

  log(`Toplam ${filteredFiles.length} dosya isleniyor...`, 'info');
  setProgress(10, `${filteredFiles.length} dosya bulundu`);

  // Fetch all file contents
  const rawFiles = [];
  for (let i = 0; i < filteredFiles.length; i++) {
    const file = filteredFiles[i];
    const percent = 10 + Math.round((i / filteredFiles.length) * 60);
    setProgress(percent, `Indiriliyor: ${file.path}`);
    try {
      const content = await fetchFileContent(owner, repo, file.path, token);
      rawFiles.push({ path: file.path, content });
      log(`OK: ${file.path}`, 'success');
    } catch (e) {
      log(`ATLANDI: ${file.path} - ${e.message}`, 'error');
    }
    // Small delay to avoid rate limiting
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 100));
  }

  setProgress(75, 'Dosyalar isleniyor...');

  // Group files
  const { rootFiles, dirMap } = groupFilesByDirectory(rawFiles);
  const processedFiles = [];

  // Root files: individual .txt files
  for (const f of rootFiles) {
    const baseName = f.path.replace(/\.[^/.]+$/, '') || f.path;
    const txtName = baseName + '.txt';
    const txtContent = buildTxtContent(f.path, f.content);
    processedFiles.push({ filename: txtName, content: txtContent });
    log(`Root dosya: ${txtName}`, 'success');
  }

  // Directory files: merged into one .txt per top-level dir
  for (const [dirName, files] of Object.entries(dirMap)) {
    const txtName = dirName + '.txt';
    const mergedContent = buildMergedTxtContent(dirName, files);
    processedFiles.push({ filename: txtName, content: mergedContent });
    log(`Klasor birlestirme: ${dirName}/ (${files.length} dosya) -> ${txtName}`, 'success');
  }

  setProgress(90, 'Tamamlaniyor...');
  return processedFiles;
}

// --- Download as ZIP ---
async function downloadFiles(files, repoName) {
  // Use JSZip loaded from CDN via background script message
  // We'll create individual files and trigger download
  // For simplicity, we create a single merged .txt if only 1 file,
  // or a .zip-like structure via multiple downloads
  // Actually, we'll use the Chrome downloads API via background

  chrome.runtime.sendMessage(
    { action: 'downloadFiles', files, repoName },
    (response) => {
      if (response && response.success) {
        log('Dosyalar indirildi!', 'success');
      } else {
        log('Indirme hatasi: ' + (response && response.error), 'error');
      }
    }
  );
}

// --- Open NotebookLM ---
function openNotebookLM() {
  chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
}

// --- Parse GitHub URL ---
function parseGitHubUrl(url) {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.replace(/^\//, '').replace(/\/+$/, '').split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  } catch (e) {
    // try raw owner/repo
    const parts = url.trim().split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  }
  return null;
}

// --- Main ---
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved values
  chrome.storage.local.get(['repoUrl', 'githubToken'], (data) => {
    if (data.repoUrl) document.getElementById('repoUrl').value = data.repoUrl;
    if (data.githubToken) document.getElementById('githubToken').value = data.githubToken;
  });

  document.getElementById('startBtn').addEventListener('click', async () => {
    const repoUrl = document.getElementById('repoUrl').value.trim();
    const token = document.getElementById('githubToken').value.trim();
    const ignoreNodeModules = document.getElementById('ignoreNodeModules').checked;
    const ignoreDotGit = document.getElementById('ignoreDotGit').checked;
    const ignoreBinaryFiles = document.getElementById('ignoreBinaryFiles').checked;
    const autoImport = document.getElementById('autoImportNotebookLM').checked;

    if (!repoUrl) {
      alert('Lutfen bir GitHub repo URL si girin!');
      return;
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      alert('Gecersiz GitHub URL si! Ornek: https://github.com/owner/repo');
      return;
    }

    // Save inputs
    chrome.storage.local.set({ repoUrl, githubToken: token });

    // Reset UI
    document.getElementById('logContent').innerHTML = '';
    document.getElementById('logContainer').classList.add('hidden');
    document.getElementById('resultContainer').classList.add('hidden');
    document.getElementById('progressContainer').classList.remove('hidden');
    document.getElementById('downloadBtn').classList.add('hidden');
    document.getElementById('openNotebookLMBtn').classList.add('hidden');

    setButtonLoading(true);

    try {
      const files = await processRepo(parsed.owner, parsed.repo, {
        token,
        ignoreNodeModules,
        ignoreDotGit,
        ignoreBinaryFiles
      });

      allProcessedFiles = files;
      setProgress(100, 'Tamamlandi!');

      const resultText = document.getElementById('resultText');
      resultText.textContent = `${files.length} txt dosyasi olusturuldu. (${files.reduce((a, f) => a + f.content.length, 0).toLocaleString()} karakter)`;
      document.getElementById('resultContainer').classList.remove('hidden');
      document.getElementById('downloadBtn').classList.remove('hidden');

      if (autoImport) {
        document.getElementById('openNotebookLMBtn').classList.remove('hidden');
      }

      log(`Basarili! ${files.length} dosya hazir.`, 'success');
    } catch (err) {
      log('HATA: ' + err.message, 'error');
      setProgress(0, 'Hata olustu');
      document.getElementById('resultText').textContent = 'Hata: ' + err.message;
      document.getElementById('resultContainer').classList.remove('hidden');
    } finally {
      setButtonLoading(false);
    }
  });

  document.getElementById('downloadBtn').addEventListener('click', () => {
    if (allProcessedFiles.length === 0) return;
    const repoUrl = document.getElementById('repoUrl').value.trim();
    const parsed = parseGitHubUrl(repoUrl) || { owner: 'repo', repo: 'files' };
    downloadFiles(allProcessedFiles, `${parsed.owner}_${parsed.repo}`);
  });

  document.getElementById('openNotebookLMBtn').addEventListener('click', () => {
    openNotebookLM();
  });
});
