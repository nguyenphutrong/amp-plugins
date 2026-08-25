# Amp Plugins

A collection of focused, open-source plugins for [Amp](https://ampcode.com/). Each plugin is developed and tested independently, then published as a single TypeScript file that Amp can install directly from a URL.

## Plugins

| Plugin | Description | Status |
| --- | --- | --- |
| [Markdown Commands](plugins/markdown-commands/) | Register reusable command-palette prompts from personal and project Markdown files. | Available |

## Install a plugin

Follow the installation instructions in the plugin's README. Install only the plugin you need rather than cloning this entire repository into Amp's plugin directory.

Amp plugins execute local code. Review a plugin and its requested behavior before installing it.

## Development

This repository uses [Bun workspaces](https://bun.sh/docs/install/workspaces). Each directory under `plugins/` owns its source, tests, examples, documentation, version, and distributable bundle.

```sh
bun install
bun run check
```

`bun run check` runs all tests, type-checks the workspaces, rebuilds every plugin, and verifies that committed files under `plugins/*/dist` are current.

To build or test one plugin:

```sh
bun run --filter @nguyenphutrong/amp-markdown-commands build
bun run --filter @nguyenphutrong/amp-markdown-commands test
```

## Adding a plugin

Create a self-contained workspace under `plugins/<name>/` with:

- `src/index.ts` as its Amp entrypoint;
- focused tests under `test/`;
- a package-level README with installation and behavior documentation;
- a `build` script that emits `dist/index.ts` as a single-file bundle.

Do not introduce shared packages until at least two plugins need the same runtime responsibility. Distribution bundles must remain independently installable and must not rely on another workspace being present.

## License

[MIT](LICENSE)
