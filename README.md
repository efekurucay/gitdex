<div align="center">
  <img src="https://raw.githubusercontent.com/efekurucay/repodex/main/icons/icon128.png" alt="repodex logo" width="96" height="96" />

  <h1>repodex</h1>
  <p>Make a whole repo understandable for LLMs.</p>

  <p>
    <a href="https://www.npmjs.com/package/repodex"><img alt="npm" src="https://img.shields.io/npm/v/repodex?style=for-the-badge&logo=npm"></a>
    <a href="https://github.com/efekurucay/repodex/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/efekurucay/repodex/ci.yml?style=for-the-badge&label=CI"></a>
    <a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/efekurucay/repodex?style=for-the-badge"></a>
    <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white">
    <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-0-22c55e?style=for-the-badge">
    <img alt="Open Source" src="https://img.shields.io/badge/Open%20Source-Yes-22c55e?style=for-the-badge">
  </p>
</div>

---

## What it does

`repodex` scans a local codebase and converts it into clean text bundles that help LLMs understand the whole repository with less noise and better structure.

- root files become separate `.txt` files
- each top-level directory becomes one merged `.txt`
- every file block starts with its relative path
- binary files are skipped by default
- `.git` is skipped by default
- `node_modules` is skipped by default
- output is written into a fresh `repodex/` folder

## NotebookLM is a use case, not the product

`repodex` is not tied to NotebookLM.

One practical use case is this:

1. run `repodex` inside a project
2. get the generated `.txt` files inside `./repodex`
3. import those files into NotebookLM

So NotebookLM support is simply one nice downstream workflow for the exported files — not the core identity of the project.

## Example

Input:

```text
project/
  README.md
  package.json
  src/
    index.ts
    utils/
      helper.ts
  docs/
    intro.md
```

Output:

```text
repodex/
  README.txt
  package.txt
  src.txt
  docs.txt
```

`src.txt`

```text
src/index.ts
import ...

---

src/utils/helper.ts
export function ...
```

## Usage

Run it in the folder you want to export:

```bash
npx repodex
```

Or point it at another folder:

```bash
npx repodex ../my-project
```

After a global install:

```bash
npm i -g repodex
repodex
```

## CLI options

```text
repodex [input-directory] [options]

Options:
  -o, --output <dir>           Output directory (default: ./repodex)
      --include-node-modules   Include node_modules
      --include-dot-git        Include .git
      --include-binary         Include binary files as UTF-8 text attempt
      --force                  Clean an existing output directory
      --silent                 Print only the final summary
  -h, --help                   Show help
  -v, --version                Show version
```

## Why this format?

This output format is intentionally simple:

- text only
- relative paths preserved at the top of each block
- top-level grouping keeps file count manageable
- easy to import into tools like NotebookLM, or inspect manually

## Notes

- `repodex/` output is automatically excluded from scanning.
- Symbolic links are skipped to avoid recursive surprises.
- If the output folder already exists and is not a repodex-managed folder, the CLI stops unless you pass `--force`.
- Output filename collisions are handled automatically.

## Local development

```bash
npm install
npm test
node ./bin/repodex.js . --output ./repodex-out
```

## Publish

This project is configured for public npm publishing:

```bash
npm publish --access public
```


## License

MIT
