import { promises as fs } from 'node:fs';
import path from 'node:path';

export const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pyc', 'class', 'o', 'a',
  'lock'
]);

export const IGNORE_DIRS = new Set(['.git', '__pycache__', '.DS_Store']);
export const OUTPUT_MARKER_FILE = '.repodex-output';

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}

function buildTxtContent(filePath, content) {
  return `${filePath}\n${content}`;
}

function buildMergedTxtContent(files) {
  return files.map((file) => `${file.path}\n${file.content}`).join('\n\n---\n\n');
}

function groupFilesByDirectory(files) {
  const rootFiles = [];
  const directoryMap = new Map();

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const slashIndex = file.path.indexOf('/');
    if (slashIndex === -1) {
      rootFiles.push(file);
      continue;
    }

    const directoryName = file.path.slice(0, slashIndex);
    if (!directoryMap.has(directoryName)) {
      directoryMap.set(directoryName, []);
    }

    directoryMap.get(directoryName).push(file);
  }

  return { rootFiles, directoryMap };
}

function createUniqueFilename(preferredName, kind, usedNames) {
  const extension = path.extname(preferredName) || '.txt';
  const stem = preferredName.slice(0, -extension.length) || preferredName;
  const fallbackStem = kind === 'directory' ? `${stem}.dir` : `${stem}.file`;

  const candidates = [preferredName, `${fallbackStem}${extension}`];
  for (const candidate of candidates) {
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  let counter = 2;
  while (true) {
    const candidate = `${fallbackStem}-${counter}${extension}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    counter += 1;
  }
}

function hasBinaryExtension(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension ? BINARY_EXTENSIONS.has(extension) : false;
}

function isLikelyBinaryBuffer(buffer) {
  if (buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isTab = byte === 9;
    const isLineFeed = byte === 10;
    const isCarriageReturn = byte === 13;
    const isPrintableAscii = byte >= 32 && byte <= 126;

    if (!isTab && !isLineFeed && !isCarriageReturn && !isPrintableAscii) {
      suspicious += 1;
    }
  }

  return suspicious / sample.length > 0.3;
}

function shouldIgnoreRelativePath(relativePath, options) {
  const parts = relativePath.split('/').filter(Boolean);

  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) {
      return true;
    }

    if (!options.includeNodeModules && part === 'node_modules') {
      return true;
    }

    if (!options.includeDotGit && part === '.git') {
      return true;
    }
  }

  return false;
}

async function readTextFile(absolutePath, relativePath, options) {
  const buffer = await fs.readFile(absolutePath);

  if (!options.includeBinary) {
    if (hasBinaryExtension(relativePath) || isLikelyBinaryBuffer(buffer)) {
      return null;
    }
  }

  return buffer.toString('utf8');
}

async function walkDirectory(currentDir, state) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = toPosixPath(path.relative(state.inputDir, absolutePath));

    if (!relativePath) {
      continue;
    }

    if (state.excludedOutputDir && absolutePath === state.excludedOutputDir) {
      continue;
    }

    if (shouldIgnoreRelativePath(relativePath, state.options)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      state.onSkip?.({ path: relativePath, reason: 'symbolic-link' });
      continue;
    }

    if (entry.isDirectory()) {
      await walkDirectory(absolutePath, state);
      continue;
    }

    if (!entry.isFile()) {
      state.onSkip?.({ path: relativePath, reason: 'unsupported-entry' });
      continue;
    }

    const content = await readTextFile(absolutePath, relativePath, state.options);
    if (content === null) {
      state.onSkip?.({ path: relativePath, reason: 'binary-file' });
      continue;
    }

    state.files.push({ path: relativePath, content });
    state.onFile?.(relativePath);
  }
}

async function ensureCleanOutputDirectory(outputDir, force) {
  let stats = null;

  try {
    stats = await fs.stat(outputDir);
  } catch {
    // Directory does not exist.
  }

  if (!stats) {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, OUTPUT_MARKER_FILE), 'repodex output directory\n', 'utf8');
    return;
  }

  if (!stats.isDirectory()) {
    throw new Error(`Output path is not a directory: ${outputDir}`);
  }

  const markerPath = path.join(outputDir, OUTPUT_MARKER_FILE);
  let hasMarker = false;
  try {
    const markerStats = await fs.stat(markerPath);
    hasMarker = markerStats.isFile();
  } catch {
    hasMarker = false;
  }

  const entries = await fs.readdir(outputDir);
  const isEmpty = entries.length === 0;

  if (!force && !hasMarker && !isEmpty) {
    throw new Error(
      `Output directory already exists and is not a repodex folder: ${outputDir}. Use --force to clean it or choose --output.`
    );
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(markerPath, 'repodex output directory\n', 'utf8');
}

export async function buildRepodex(inputDir, outputDir, options = {}, hooks = {}) {
  const resolvedInputDir = path.resolve(inputDir);
  const resolvedOutputDir = path.resolve(outputDir);
  const normalizedOptions = {
    includeNodeModules: Boolean(options.includeNodeModules),
    includeDotGit: Boolean(options.includeDotGit),
    includeBinary: Boolean(options.includeBinary),
    force: Boolean(options.force)
  };

  const relativeOutput = path.relative(resolvedInputDir, resolvedOutputDir);
  const outputInsideInput =
    relativeOutput &&
    !relativeOutput.startsWith('..') &&
    !path.isAbsolute(relativeOutput);

  await ensureCleanOutputDirectory(resolvedOutputDir, normalizedOptions.force);

  const state = {
    inputDir: resolvedInputDir,
    excludedOutputDir: outputInsideInput ? resolvedOutputDir : null,
    options: normalizedOptions,
    files: [],
    onFile: hooks.onFile,
    onSkip: hooks.onSkip
  };

  await walkDirectory(resolvedInputDir, state);

  const { rootFiles, directoryMap } = groupFilesByDirectory(state.files);
  const usedNames = new Set();
  const outputs = [];

  for (const file of rootFiles) {
    const baseName = sanitizeName(path.parse(file.path).name || file.path);
    const filename = createUniqueFilename(`${baseName}.txt`, 'file', usedNames);
    const content = buildTxtContent(file.path, file.content);
    await fs.writeFile(path.join(resolvedOutputDir, filename), content, 'utf8');
    outputs.push({ filename, source: file.path, type: 'root-file' });
  }

  for (const [directoryName, files] of [...directoryMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const filename = createUniqueFilename(`${sanitizeName(directoryName)}.txt`, 'directory', usedNames);
    const content = buildMergedTxtContent(files);
    await fs.writeFile(path.join(resolvedOutputDir, filename), content, 'utf8');
    outputs.push({ filename, source: directoryName, type: 'directory-group' });
  }

  return {
    inputDir: resolvedInputDir,
    outputDir: resolvedOutputDir,
    scannedFiles: state.files.length,
    generatedFiles: outputs.length,
    outputs
  };
}
