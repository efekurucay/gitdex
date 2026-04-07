import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRepox, OUTPUT_MARKER_FILE } from '../src/core.js';

async function writeFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

test('buildRepox groups root files and top-level directories', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repox-test-'));
  const inputDir = path.join(tempRoot, 'project');
  const outputDir = path.join(inputDir, 'repox');

  await writeFile(path.join(inputDir, 'README.md'), '# Hello\n');
  await writeFile(path.join(inputDir, 'package.json'), '{"name":"demo"}\n');
  await writeFile(path.join(inputDir, 'src', 'index.js'), 'console.log("hi");\n');
  await writeFile(path.join(inputDir, 'src', 'utils', 'helper.js'), 'export const x = 1;\n');
  await writeFile(path.join(inputDir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n');
  await writeFile(path.join(inputDir, '.git', 'config'), '[core]\n');
  await fs.writeFile(path.join(inputDir, 'logo.png'), Buffer.from([0, 1, 2, 3, 4]));

  const result = await buildRepox(inputDir, outputDir);

  assert.equal(result.generatedFiles, 3);

  const outputFiles = (await fs.readdir(outputDir)).sort();
  assert.deepEqual(outputFiles, [OUTPUT_MARKER_FILE, 'README.txt', 'package.txt', 'src.txt'].sort());

  const readmeTxt = await fs.readFile(path.join(outputDir, 'README.txt'), 'utf8');
  assert.match(readmeTxt, /^README\.md\n# Hello/m);

  const srcTxt = await fs.readFile(path.join(outputDir, 'src.txt'), 'utf8');
  assert.match(srcTxt, /src\/index\.js\nconsole\.log\("hi"\);/);
  assert.match(srcTxt, /---/);
  assert.doesNotMatch(srcTxt, /node_modules/);
});

test('buildRepox protects non-repox output directories unless forced', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repox-test-'));
  const inputDir = path.join(tempRoot, 'project');
  const outputDir = path.join(inputDir, 'custom-output');

  await writeFile(path.join(inputDir, 'README.md'), '# Hello\n');
  await writeFile(path.join(outputDir, 'keep.txt'), 'do not remove\n');

  await assert.rejects(() => buildRepox(inputDir, outputDir), /not a repox folder/);
  await buildRepox(inputDir, outputDir, { force: true });

  const outputFiles = await fs.readdir(outputDir);
  assert.ok(outputFiles.includes(OUTPUT_MARKER_FILE));
  assert.ok(outputFiles.includes('README.txt'));
  assert.ok(!outputFiles.includes('keep.txt'));
});
