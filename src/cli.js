import path from 'node:path';
import process from 'node:process';
import { buildGitdex } from './core.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const colors = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  blue: '\u001B[34m',
  red: '\u001B[31m',
  cyan: '\u001B[36m'
};

function colorize(color, value) {
  return `${colors[color] ?? ''}${value}${colors.reset}`;
}

function printHelp() {
  console.log(`
${colorize('bold', 'gitdex')} — make a repo understandable for LLMs via clean .txt bundles.

Usage:
  gitdex [input-directory] [options]

Options:
  -o, --output <dir>           Output directory (default: ./gitdex)
      --include-node-modules   Include node_modules
      --include-dot-git        Include .git
      --include-binary         Include binary files as UTF-8 text attempt
      --force                  Clean an existing output directory
      --silent                 Print only the final summary
  -h, --help                   Show help
  -v, --version                Show version

Examples:
  gitdex
  gitdex .
  gitdex ../my-project --output ./gitdex
  gitdex . --force --include-node-modules
`);
}

async function getVersion() {
  const thisFile = fileURLToPath(import.meta.url);
  const packageJsonPath = path.resolve(path.dirname(thisFile), '..', 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function parseArgs(argv) {
  const args = {
    inputDir: '.',
    outputDir: 'gitdex',
    includeNodeModules: false,
    includeDotGit: false,
    includeBinary: false,
    force: false,
    silent: false,
    help: false,
    version: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }

    if (arg === '-v' || arg === '--version') {
      args.version = true;
      continue;
    }

    if (arg === '--include-node-modules') {
      args.includeNodeModules = true;
      continue;
    }

    if (arg === '--include-dot-git') {
      args.includeDotGit = true;
      continue;
    }

    if (arg === '--include-binary') {
      args.includeBinary = true;
      continue;
    }

    if (arg === '--force') {
      args.force = true;
      continue;
    }

    if (arg === '--silent') {
      args.silent = true;
      continue;
    }

    if (arg === '-o' || arg === '--output') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --output');
      }
      args.outputDir = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    args.inputDir = arg;
  }

  return args;
}

export async function runCli(argv) {
  try {
    const args = parseArgs(argv);

    if (args.help) {
      printHelp();
      return;
    }

    if (args.version) {
      console.log(await getVersion());
      return;
    }

    if (!args.silent) {
      console.log(colorize('bold', 'gitdex'));
      console.log(colorize('dim', `input:  ${path.resolve(args.inputDir)}`));
      console.log(colorize('dim', `output: ${path.resolve(args.outputDir)}`));
      console.log('');
    }

    const result = await buildGitdex(args.inputDir, args.outputDir, args, {
      onFile: args.silent
        ? undefined
        : (filePath) => {
            console.log(`${colorize('green', '✓')} ${filePath}`);
          },
      onSkip: args.silent
        ? undefined
        : ({ path: filePath, reason }) => {
            const label = reason === 'binary-file' ? 'binary' : reason;
            console.log(`${colorize('yellow', '↷')} ${filePath} ${colorize('dim', `(${label})`)}`);
          }
    });

    console.log('');
    console.log(`${colorize('cyan', 'done')} ${result.generatedFiles} txt file(s) created in ${result.outputDir}`);
    console.log(colorize('dim', `${result.scannedFiles} source text file(s) processed.`));
  } catch (error) {
    console.error(colorize('red', `error: ${error.message}`));
    process.exitCode = 1;
  }
}
