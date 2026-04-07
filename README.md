<div align="center">
  <img src="https://raw.githubusercontent.com/efekurucay/repox/main/icons/icon128.png" alt="repox logo" width="96" height="96" />

  <h1>repox</h1>
  <p>Turn any local folder into clean, portable <code>.txt</code> bundles.</p>

  <p>
    <a href="https://www.npmjs.com/package/@efekurucay/repox"><img alt="npm" src="https://img.shields.io/npm/v/%40efekurucay%2Frepox?style=for-the-badge&logo=npm"></a>
    <a href="https://github.com/efekurucay/repox/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/efekurucay/repox/ci.yml?style=for-the-badge&label=CI"></a>
    <a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/efekurucay/repox?style=for-the-badge"></a>
    <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white">
    <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-0-22c55e?style=for-the-badge">
    <img alt="Open Source" src="https://img.shields.io/badge/Open%20Source-Yes-22c55e?style=for-the-badge">
  </p>
</div>

---

## What it does

`repox` scans a local folder and converts it into clean text bundles that are easy to read, move, archive, diff, index, or feed into AI tools.

- root files become separate `.txt` files
- each top-level directory becomes one merged `.txt`
- every file block starts with its relative path
- binary files are skipped by default
- `.git` is skipped by default
- `node_modules` is skipped by default
- output is written into a fresh `repox/` folder

## NotebookLM is a use case, not the product

`repox` is not tied to NotebookLM.

One practical use case is this:

1. run `repox` inside a project
2. get the generated `.txt` files inside `./repox`
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
repox/
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
npx @efekurucay/repox
```

Or point it at another folder:

```bash
npx @efekurucay/repox ../my-project
```

After a global install:

```bash
npm i -g @efekurucay/repox
repox
```

## CLI options

```text
repox [input-directory] [options]

Options:
  -o, --output <dir>           Output directory (default: ./repox)
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

- `repox/` output is automatically excluded from scanning.
- Symbolic links are skipped to avoid recursive surprises.
- If the output folder already exists and is not a repox-managed folder, the CLI stops unless you pass `--force`.
- Output filename collisions are handled automatically.

## Local development

```bash
npm install
npm test
node ./bin/repox.js . --output ./repox-out
```

## Publish

This project is configured for public npm publishing:

```bash
npm publish --access public
```

> Current package name is scoped as `@efekurucay/repox`. If unscoped `repox` becomes usable and you want that name instead, the package name can be switched later.

## License

MIT
