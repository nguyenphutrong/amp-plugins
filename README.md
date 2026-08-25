# Markdown commands for Amp

Define reusable Amp command-palette prompts as Markdown files. The file name identifies the command, YAML frontmatter controls how it appears, and the Markdown body becomes the prompt sent to Amp.

This plugin follows the command-file model used by Claude Code and OpenCode while using Amp's `registerCommand` API.

## Install

Clone the repository into Amp's user plugin directory:

```sh
git clone https://github.com/nguyenphutrong/amp-commands.git ~/.config/amp/plugins/markdown-commands
```

Reload plugins from Amp's command palette with `Ctrl+O`, then select `plugins: reload`.

To update an existing installation:

```sh
git -C ~/.config/amp/plugins/markdown-commands pull --ff-only
```

Amp runs plugins as local code. Review a plugin before installing it.

## Create a command

Put Markdown command files in either location:

- Personal commands: `~/.config/amp/commands/**/*.md`
- Project commands: `.amp/commands/**/*.md`

When `XDG_CONFIG_HOME` is set, personal commands use `$XDG_CONFIG_HOME/amp/commands`. On Windows, the default path is `%USERPROFILE%\.config\amp\commands`.

Project commands override personal commands with the same relative path. Reload plugins after adding or changing a command.

Create `.amp/commands/review-pr.md`:

```markdown
---
title: Review pull request
category: GitHub
description: Review a pull request for correctness and regressions.
argument-hint: "<pull-request-number> [focus]"
---

Review pull request $1.

Pay special attention to: $2
```

Open Amp's command palette with `Ctrl+O`, search for `Review pull request`, and enter the arguments when prompted.

## Command format

Frontmatter is optional. The plugin supports these fields:

| Field | Purpose |
| --- | --- |
| `title` | Text shown in the command palette. Defaults to a readable form of the relative file path. |
| `category` | Palette category. Defaults to `Markdown commands`. |
| `description` | Short help text shown in the palette. |
| `argument-hint` | Help text shown in the argument dialog. |

The Markdown body supports:

- `$ARGUMENTS` for the complete input string.
- `$1`, `$2`, and later positions for individual arguments.

Use quotes to keep words together. For example, `123 "security and auth"` maps `$1` to `123` and `$2` to `security and auth`. Empty quoted arguments and Windows paths are preserved.

If the body contains an argument placeholder, the plugin asks for input before sending the prompt. Otherwise, it sends the prompt immediately. The prompt goes to the active thread. When no thread exists, the plugin creates a visible thread in Amp's `medium` mode.

Nested files are supported. For example, `.amp/commands/github/review-pr.md` appears with the derived title `Github / Review Pr` unless frontmatter provides a title.

## Security and limitations

- Commands appear in Amp's command palette. Amp's plugin API does not expose slash-command arguments directly, so this plugin uses an input dialog.
- The plugin does not execute inline shell expressions such as ``!`git status` ``. Put the instruction to run a command in the prompt so Amp applies its normal tool policy.
- File references such as `@src/app.ts` are passed through as prompt text. Their handling follows the active Amp client's normal prompt behavior.
- Invalid Markdown command files are logged and skipped without disabling other commands.

## Examples

Example commands live in [`examples/`](examples/). Copy an example into a personal or project command directory to enable it.

```sh
mkdir -p ~/.config/amp/commands
cp examples/review-changes.md ~/.config/amp/commands/
```

## Development

The repository root is the plugin directory. This lets a clone run directly from Amp's user plugin location without a build step or runtime dependencies.

Run all tests with Bun:

```sh
bun test
```

The test suite covers frontmatter parsing, nested discovery, command ID uniqueness, quoted and positional arguments, personal/project precedence, cancellation, and thread selection.

## License

[MIT](LICENSE)
