// @bun
// src/index.ts
import { homedir } from "os";
import { join } from "path";

// src/command.ts
import { readdir, readFile } from "fs/promises";
import { relative, resolve, sep } from "path";
function optionalString(value, field, source) {
  if (value === undefined)
    return;
  if (typeof value !== "string") {
    throw new Error(`${source}: frontmatter field "${field}" must be a string`);
  }
  return value.trim() || undefined;
}
function humanize(name) {
  return name.split("/").map((part) => part.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")).join(" / ");
}
function splitDocument(content, source) {
  const normalized = content.replaceAll(`\r
`, `
`);
  if (!normalized.startsWith(`---
`)) {
    return { frontmatter: {}, template: normalized.trim() };
  }
  const closing = normalized.indexOf(`
---
`, 4);
  if (closing === -1) {
    throw new Error(`${source}: YAML frontmatter is missing its closing ---`);
  }
  const parsed = Bun.YAML.parse(normalized.slice(4, closing));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${source}: YAML frontmatter must be an object`);
  }
  return {
    frontmatter: parsed,
    template: normalized.slice(closing + 5).trim()
  };
}
function parseMarkdownCommand(content, source, name) {
  const { frontmatter, template } = splitDocument(content, source);
  if (!template)
    throw new Error(`${source}: command prompt is empty`);
  const encodedName = Buffer.from(name, "utf8").toString("base64url");
  return {
    name,
    id: `markdown-command-${encodedName}`,
    title: optionalString(frontmatter.title, "title", source) ?? humanize(name),
    category: optionalString(frontmatter.category, "category", source) ?? "Markdown commands",
    description: optionalString(frontmatter.description, "description", source),
    argumentHint: optionalString(frontmatter["argument-hint"], "argument-hint", source),
    template,
    source
  };
}
async function loadCommandDirectory(directory, onError = () => {}) {
  let entries;
  try {
    entries = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT")
      return [];
    throw error;
  }
  const commands = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md"))
      continue;
    const source = resolve(entry.parentPath, entry.name);
    const name = relative(directory, source).split(sep).join("/").slice(0, -3);
    try {
      commands.push(parseMarkdownCommand(await readFile(source, "utf8"), source, name));
    } catch (error) {
      onError(error, source);
    }
  }
  return commands.sort((left, right) => left.name.localeCompare(right.name));
}
function hasArguments(template) {
  return /\$ARGUMENTS|\$\d+/.test(template);
}
function splitArguments(input) {
  const values = [];
  let current = "";
  let quote;
  let tokenStarted = false;
  for (let index = 0;index < input.length; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === quote)
        quote = undefined;
      else if (quote === '"' && character === "\\" && (input[index + 1] === '"' || input[index + 1] === "\\")) {
        current += input[index + 1];
        index += 1;
      } else
        current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (character === "\\" && input[index + 1] !== undefined && /[\s\\"']/.test(input[index + 1])) {
      current += input[index + 1];
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      if (tokenStarted) {
        values.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += character;
    tokenStarted = true;
  }
  if (tokenStarted)
    values.push(current);
  return values;
}
function renderTemplate(template, input) {
  const argumentsByPosition = splitArguments(input);
  return template.replace(/\$ARGUMENTS|\$(\d+)/g, (placeholder, position) => {
    if (placeholder === "$ARGUMENTS")
      return input;
    return argumentsByPosition[Number(position) - 1] ?? "";
  });
}

// src/index.ts
var description = "Registers reusable Amp command-palette prompts from Markdown files.";
function userCommandsDirectory() {
  const configHome = process.env.XDG_CONFIG_HOME;
  if (configHome)
    return join(configHome, "amp", "commands");
  return join(homedir(), ".config", "amp", "commands");
}
async function promptForArguments(command, ctx) {
  if (!hasArguments(command.template))
    return "";
  return ctx.ui.input({
    title: command.title,
    helpText: command.argumentHint ?? "Enter command arguments.",
    submitButtonText: "Run command"
  });
}
async function targetThread(amp, ctx) {
  if (ctx.thread)
    return ctx.thread;
  return amp.getBuiltinAgent("medium").createThread({ show: true });
}
async function markdownCommandsPlugin(amp) {
  const userDirectory = userCommandsDirectory();
  const workspaceRoot = amp.system.workspaceRoot ? amp.helpers.filePathFromURI(amp.system.workspaceRoot) : undefined;
  const projectDirectory = workspaceRoot ? join(workspaceRoot, ".amp", "commands") : undefined;
  const commandsByName = new Map;
  for (const directory of [userDirectory, projectDirectory]) {
    if (!directory)
      continue;
    try {
      const commands = await loadCommandDirectory(directory, (error, source) => {
        amp.logger.log(`Skipping invalid Markdown command ${source}:`, error);
      });
      for (const command of commands) {
        commandsByName.set(command.name, command);
      }
    } catch (error) {
      amp.logger.log(`Could not load Markdown commands from ${directory}:`, error);
    }
  }
  for (const command of commandsByName.values()) {
    amp.registerCommand(command.id, {
      title: command.title,
      category: command.category,
      description: command.description
    }, async (ctx) => {
      const input = await promptForArguments(command, ctx);
      if (input === undefined)
        return;
      const prompt = renderTemplate(command.template, input);
      const thread = await targetThread(amp, ctx);
      await thread.appendUserMessage({ type: "user-message", content: prompt });
    });
  }
  amp.logger.log(`Registered ${commandsByName.size} Markdown command(s)`);
}
export {
  markdownCommandsPlugin as default,
  description
};
