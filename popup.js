const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pyc', 'class', 'o', 'a',
  'lock'
]);

const IGNORE_DIRS = new Set(['.git', '__pycache__', '.DS_Store']);
const REPO_URL_STORAGE_KEY = 'repoUrl';
const GITHUB_TOKEN_STORAGE_KEY = 'githubToken';
const PENDING_NOTEBOOKLM_KEY = 'pendingNotebookLMUpload';

let allProcessedFiles = [];

function storageGet(area, keys) {
  return new Promise(resolve => chrome.storage[area].get(keys, resolve));
}

function storageSet(area, value) {
  return new Promise(resolve => chrome.storage[area].set(value, resolve));
}

function storageRemove(area, keys) {
  return new Promise(resolve => chrome.storage[area].remove(keys, resolve));
}

function log(message, type = 'info') {
  const logContent = document.getElementById('logContent');
  const line = document.createElement('div');
  line.className = `log-${type}`;
  line.textContent = message;
  logContent.appendChild(line);
  logContent.scrollTop = logContent.scrollHeight;
  document.getElementById('logContainer').classList.remove('hidden');
}

function setProgress(percent, text) {
  document.getElementById('progressFill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
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

function setDownloadLoading(loading) {
  const button = document.getElementById('downloadBtn');
  button.disabled = loading;
  button.textContent = loading ? 'ZIP Hazirlaniyor...' : 'ZIP Olarak Indir';
}

function setImportLoading(loading) {
  const button = document.getElementById('importNotebookLMBtn');
  button.disabled = loading;
  button.textContent = loading ? 'Aktariliyor...' : "NotebookLM'e Aktar";
}

function buildGitHubHeaders(token, accept = 'application/vnd.github+json') {
  const headers = { Accept: accept };
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  return headers;
}

function encodeGitHubPath(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

async function fetchGitHubJson(url, token, errorPrefix) {
  const response = await fetch(url, {
    headers: buildGitHubHeaders(token)
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.message) {
        detail += ` - ${body.message}`;
      }
    } catch {
      // Ignore JSON parsing errors in error path.
    }
    throw new Error(`${errorPrefix}: ${detail}`);
  }

  return response.json();
}

async function fetchRepoMetadata(owner, repo, token) {
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repoData = await fetchGitHubJson(repoUrl, token, 'Repo bulunamadi');
  return {
    branch: repoData.default_branch
  };
}

async function fetchGitHubTree(owner, repo, branch, token) {
  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  return fetchGitHubJson(treeUrl, token, 'Tree alinamadi');
}

async function fetchDirectoryEntries(owner, repo, branch, directoryPath, token) {
  const suffix = directoryPath ? `/${encodeGitHubPath(directoryPath)}` : '';
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${suffix}?ref=${encodeURIComponent(branch)}`;
  const payload = await fetchGitHubJson(url, token, `Klasor okunamadi (${directoryPath || '/'})`);
  return Array.isArray(payload) ? payload : [];
}

async function fetchFileContent(owner, repo, branch, path, token) {
  const headers = buildGitHubHeaders(token, 'application/vnd.github.v3.raw');
  const suffix = encodeGitHubPath(path);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${suffix}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Dosya alinamadi: ${path}`);
  }

  return response.text();
}

function isBinaryFile(path) {
  const extension = path.includes('.') ? path.split('.').pop().toLowerCase() : '';
  return BINARY_EXTENSIONS.has(extension);
}

function shouldIgnore(path, ignoreNodeModules, ignoreDotGit) {
  const parts = path.split('/');
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) {
      return true;
    }
    if (ignoreNodeModules && part === 'node_modules') {
      return true;
    }
    if (ignoreDotGit && part === '.git') {
      return true;
    }
  }
  return false;
}

async function fetchRepositoryInventory(owner, repo, options) {
  const { token, ignoreNodeModules, ignoreDotGit } = options;
  const { branch } = await fetchRepoMetadata(owner, repo, token);
  const treeResponse = await fetchGitHubTree(owner, repo, branch, token);

  if (!treeResponse.truncated) {
    return {
      branch,
      tree: Array.isArray(treeResponse.tree) ? treeResponse.tree : [],
      strategy: 'git-tree'
    };
  }

  log('UYARI: Git tree truncated oldu. Contents API fallback devrede.', 'error');
  setProgress(8, 'Buyuk repo algilandi, klasorler tek tek taraniyor...');

  const discoveredFiles = [];
  const directories = [''];
  let scannedDirectoryCount = 0;

  while (directories.length > 0) {
    const currentDirectory = directories.shift();
    scannedDirectoryCount += 1;
    setProgress(8, `Klasorler taraniyor (${scannedDirectoryCount})...`);

    const entries = await fetchDirectoryEntries(owner, repo, branch, currentDirectory, token);
    for (const entry of entries) {
      if (!entry?.path) {
        continue;
      }

      if (shouldIgnore(entry.path, ignoreNodeModules, ignoreDotGit)) {
        continue;
      }

      if (entry.type === 'dir') {
        directories.push(entry.path);
        continue;
      }

      if (entry.type === 'file' || entry.type === 'symlink') {
        discoveredFiles.push({ path: entry.path, type: 'blob' });
      }
    }
  }

  return {
    branch,
    tree: discoveredFiles,
    strategy: 'contents-fallback'
  };
}

function groupFilesByDirectory(files) {
  const rootFiles = [];
  const directoryMap = {};

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const slashIndex = file.path.indexOf('/');
    if (slashIndex === -1) {
      rootFiles.push(file);
      continue;
    }

    const directoryName = file.path.slice(0, slashIndex);
    if (!directoryMap[directoryName]) {
      directoryMap[directoryName] = [];
    }
    directoryMap[directoryName].push(file);
  }

  return { rootFiles, directoryMap };
}

function buildTxtContent(path, content) {
  return `${path}\n${content}`;
}

function buildMergedTxtContent(files) {
  return files.map(file => `${file.path}\n${file.content}`).join('\n\n---\n\n');
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ellipsizeMiddle(value, maxLength = 52) {
  if (value.length <= maxLength) {
    return value;
  }

  const side = Math.max(8, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, side)}...${value.slice(-side)}`;
}

function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'repo';
}

async function processRepo(owner, repo, options) {
  const { token, ignoreNodeModules, ignoreDotGit, ignoreBinaryFiles } = options;

  log(`Repo bilgileri aliniyor: ${owner}/${repo}`, 'info');
  setProgress(5, 'Repo agaci aliniyor...');

  const { branch, tree, strategy } = await fetchRepositoryInventory(owner, repo, options);
  const allFiles = tree.filter(item => item.type === 'blob');
  const filteredFiles = allFiles.filter(item => {
    if (shouldIgnore(item.path, ignoreNodeModules, ignoreDotGit)) {
      return false;
    }
    if (ignoreBinaryFiles && isBinaryFile(item.path)) {
      return false;
    }
    return true;
  });

  if (strategy === 'contents-fallback') {
    log(`Fallback tarama tamamlandi. ${filteredFiles.length} dosya bulundu.`, 'info');
  }

  log(`Toplam ${filteredFiles.length} dosya isleniyor...`, 'info');
  setProgress(12, `${filteredFiles.length} dosya bulundu`);

  const rawFiles = [];
  const fetchStart = performance.now();

  for (let index = 0; index < filteredFiles.length; index += 1) {
    const file = filteredFiles[index];
    const completedCount = index;
    const elapsed = performance.now() - fetchStart;
    const averageMs = completedCount > 0 ? elapsed / completedCount : 0;
    const remainingMs = averageMs * (filteredFiles.length - completedCount);
    const percent = 12 + Math.round(((index + 1) / Math.max(filteredFiles.length, 1)) * 68);
    const etaText = completedCount > 0 ? ` • ETA ${formatDuration(remainingMs)}` : '';

    setProgress(percent, `Indiriliyor ${index + 1}/${filteredFiles.length}${etaText} • ${ellipsizeMiddle(file.path)}`);

    try {
      const content = await fetchFileContent(owner, repo, branch, file.path, token);
      rawFiles.push({ path: file.path, content });
      log(`OK: ${file.path}`, 'success');
    } catch (error) {
      log(`ATLANDI: ${file.path} - ${error.message}`, 'error');
    }

    if (index > 0 && index % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 75));
    }
  }

  setProgress(84, 'TXT dosyalari hazirlaniyor...');

  const { rootFiles, directoryMap } = groupFilesByDirectory(rawFiles);
  const processedFiles = [];

  for (const file of rootFiles) {
    const baseName = file.path.replace(/\.[^/.]+$/, '') || file.path;
    const txtName = `${baseName}.txt`;
    processedFiles.push({
      filename: txtName,
      content: buildTxtContent(file.path, file.content)
    });
    log(`Root dosya: ${txtName}`, 'success');
  }

  for (const [directoryName, files] of Object.entries(directoryMap).sort(([left], [right]) => left.localeCompare(right))) {
    const txtName = `${directoryName}.txt`;
    processedFiles.push({
      filename: txtName,
      content: buildMergedTxtContent(files)
    });
    log(`Klasor birlestirme: ${directoryName}/ (${files.length} dosya) -> ${txtName}`, 'success');
  }

  setProgress(94, 'ZIP indirilmeye hazir.');
  return processedFiles;
}

async function downloadFilesAsZip(files, repoName) {
  if (!files.length) {
    throw new Error('ZIP icin dosya bulunamadi.');
  }

  const zipEntries = files.map(file => ({
    name: `${repoName}/${file.filename}`,
    data: file.content
  }));

  const zipBlob = createZipBlob(zipEntries);
  const zipUrl = URL.createObjectURL(zipBlob);

  await new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: zipUrl,
        filename: `${repoName}.zip`,
        saveAs: false,
        conflictAction: 'overwrite'
      },
      downloadId => {
        const runtimeError = chrome.runtime.lastError;
        setTimeout(() => URL.revokeObjectURL(zipUrl), 1500);

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!downloadId) {
          reject(new Error('Chrome downloads API indirmeyi baslatamadi.'));
          return;
        }

        resolve(downloadId);
      }
    );
  });
}

function openNotebookLM() {
  chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
}

async function queueNotebookLMPayload(files, repoLabel) {
  const payload = {
    version: 1,
    files: files.map((file) => ({ filename: file.filename, content: file.content })),
    repoLabel: repoLabel || '',
    createdAt: Date.now()
  };
  await storageSet('local', { [PENDING_NOTEBOOKLM_KEY]: payload });
}

function startNotebookLMImportFromBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'START_NOTEBOOKLM_IMPORT' }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve({ ok: false, error: runtimeError.message });
        return;
      }
      resolve(response || { ok: false, error: 'Beklenmeyen bos yanit' });
    });
  });
}

async function runNotebookLMImport(files, repoLabel) {
  if (!files.length) {
    return { ok: false, error: 'Aktarilacak dosya yok.' };
  }
  await queueNotebookLMPayload(files, repoLabel);
  return startNotebookLMImportFromBackground();
}

function parseGitHubUrl(value) {
  const input = value.trim();
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (url.hostname.toLowerCase().includes('github.com') && parts.length >= 2) {
      return {
        owner: parts[0],
        repo: parts[1].replace(/\.git$/i, '')
      };
    }
  } catch {
    const parts = input.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      return {
        owner: parts[0],
        repo: parts[1].replace(/\.git$/i, '')
      };
    }
  }

  return null;
}

async function restoreSavedInputs() {
  const localData = await storageGet('local', [REPO_URL_STORAGE_KEY, GITHUB_TOKEN_STORAGE_KEY]);
  const sessionData = await storageGet('session', [GITHUB_TOKEN_STORAGE_KEY]);

  if (localData.repoUrl) {
    document.getElementById('repoUrl').value = localData.repoUrl;
  }

  if (localData.githubToken && !sessionData.githubToken) {
    await storageSet('session', { [GITHUB_TOKEN_STORAGE_KEY]: localData.githubToken });
    await storageRemove('local', GITHUB_TOKEN_STORAGE_KEY);
  }

  const token = sessionData.githubToken || localData.githubToken || '';
  if (token) {
    document.getElementById('githubToken').value = token;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await restoreSavedInputs();

  document.getElementById('startBtn').addEventListener('click', async () => {
    const repoUrl = document.getElementById('repoUrl').value.trim();
    const token = document.getElementById('githubToken').value.trim();
    const ignoreNodeModules = document.getElementById('ignoreNodeModules').checked;
    const ignoreDotGit = document.getElementById('ignoreDotGit').checked;
    const ignoreBinaryFiles = document.getElementById('ignoreBinaryFiles').checked;
    const autoImport = document.getElementById('autoImportNotebookLM').checked;

    if (!repoUrl) {
      alert('Lutfen bir GitHub repo URLsi girin.');
      return;
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      alert('Gecersiz GitHub URLsi. Ornek: https://github.com/owner/repo');
      return;
    }

    await storageSet('local', { [REPO_URL_STORAGE_KEY]: repoUrl });
    if (token) {
      await storageSet('session', { [GITHUB_TOKEN_STORAGE_KEY]: token });
    } else {
      await storageRemove('session', GITHUB_TOKEN_STORAGE_KEY);
    }
    await storageRemove('local', GITHUB_TOKEN_STORAGE_KEY);

    allProcessedFiles = [];
    document.getElementById('logContent').innerHTML = '';
    document.getElementById('logContainer').classList.add('hidden');
    document.getElementById('resultContainer').classList.add('hidden');
    document.getElementById('progressContainer').classList.remove('hidden');
    document.getElementById('downloadBtn').classList.add('hidden');
    document.getElementById('importNotebookLMBtn').classList.add('hidden');
    document.getElementById('openNotebookLMBtn').classList.add('hidden');
    setDownloadLoading(false);
    setImportLoading(false);
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

      const totalCharacters = files.reduce((sum, file) => sum + file.content.length, 0);
      document.getElementById('resultText').textContent = `${files.length} txt dosyasi hazir. ZIP olarak indirilebilir. (${totalCharacters.toLocaleString()} karakter)`;
      document.getElementById('resultContainer').classList.remove('hidden');
      document.getElementById('downloadBtn').classList.remove('hidden');
      document.getElementById('importNotebookLMBtn').classList.remove('hidden');
      document.getElementById('openNotebookLMBtn').classList.remove('hidden');

      log(`Basarili! ${files.length} dosya ZIP icin hazir.`, 'success');

      if (autoImport) {
        log('NotebookLM aktarimi baslatiliyor...', 'info');
        const importResult = await runNotebookLMImport(files, `${parsed.owner}/${parsed.repo}`);
        if (importResult.ok) {
          log(`NotebookLM: ${importResult.uploaded} dosya yukleme inputuna aktarildi.`, 'success');
        } else {
          log(`NotebookLM aktarim basarisiz: ${importResult.error}`, 'error');
        }
      }
    } catch (error) {
      log(`HATA: ${error.message}`, 'error');
      setProgress(0, 'Hata olustu');
      document.getElementById('resultText').textContent = `Hata: ${error.message}`;
      document.getElementById('resultContainer').classList.remove('hidden');
    } finally {
      setButtonLoading(false);
    }
  });

  document.getElementById('downloadBtn').addEventListener('click', async () => {
    if (!allProcessedFiles.length) {
      return;
    }

    const repoUrl = document.getElementById('repoUrl').value.trim();
    const parsed = parseGitHubUrl(repoUrl) || { owner: 'repo', repo: 'files' };
    const repoName = sanitizeName(`${parsed.owner}_${parsed.repo}`);

    try {
      setDownloadLoading(true);
      setProgress(100, 'ZIP olusturuluyor ve indiriliyor...');
      await downloadFilesAsZip(allProcessedFiles, repoName);
      log(`ZIP indirildi: ${repoName}.zip`, 'success');
      setProgress(100, 'ZIP indirildi.');
    } catch (error) {
      log(`ZIP indirme hatasi: ${error.message}`, 'error');
      setProgress(100, 'ZIP indirme hatasi olustu.');
    } finally {
      setDownloadLoading(false);
    }
  });

  document.getElementById('importNotebookLMBtn').addEventListener('click', async () => {
    if (!allProcessedFiles.length) {
      return;
    }
    const repoUrl = document.getElementById('repoUrl').value.trim();
    const parsed = parseGitHubUrl(repoUrl) || { owner: 'repo', repo: 'files' };
    const label = `${parsed.owner}/${parsed.repo}`;
    setImportLoading(true);
    log('NotebookLM aktarimi baslatiliyor...', 'info');
    try {
      const importResult = await runNotebookLMImport(allProcessedFiles, label);
      if (importResult.ok) {
        log(`NotebookLM: ${importResult.uploaded} dosya inputa verildi.`, 'success');
      } else {
        log(`NotebookLM aktarim basarisiz: ${importResult.error}`, 'error');
      }
    } catch (error) {
      log(`NotebookLM aktarim hatasi: ${error.message}`, 'error');
    } finally {
      setImportLoading(false);
    }
  });

  document.getElementById('openNotebookLMBtn').addEventListener('click', () => {
    openNotebookLM();
  });
});
