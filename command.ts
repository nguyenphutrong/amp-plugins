import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export interface MarkdownCommand {
	name: string
	id: string
	title: string
	category: string
	description?: string
	argumentHint?: string
	template: string
	source: string
}

interface CommandFrontmatter {
	title?: unknown
	category?: unknown
	description?: unknown
	'argument-hint'?: unknown
}

function optionalString(value: unknown, field: string, source: string): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== 'string') {
		throw new Error(`${source}: frontmatter field "${field}" must be a string`)
	}
	return value.trim() || undefined
}

function humanize(name: string): string {
	return name
		.split('/')
		.map((part) =>
			part
				.split(/[-_]+/)
				.filter(Boolean)
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' '),
		)
		.join(' / ')
}

function splitDocument(content: string, source: string): {
	frontmatter: CommandFrontmatter
	template: string
} {
	const normalized = content.replaceAll('\r\n', '\n')
	if (!normalized.startsWith('---\n')) {
		return { frontmatter: {}, template: normalized.trim() }
	}

	const closing = normalized.indexOf('\n---\n', 4)
	if (closing === -1) {
		throw new Error(`${source}: YAML frontmatter is missing its closing ---`)
	}

	const parsed = Bun.YAML.parse(normalized.slice(4, closing))
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${source}: YAML frontmatter must be an object`)
	}

	return {
		frontmatter: parsed as CommandFrontmatter,
		template: normalized.slice(closing + 5).trim(),
	}
}

export function parseMarkdownCommand(content: string, source: string, name: string): MarkdownCommand {
	const { frontmatter, template } = splitDocument(content, source)
	if (!template) throw new Error(`${source}: command prompt is empty`)

	const encodedName = Buffer.from(name, 'utf8').toString('base64url')
	return {
		name,
		id: `markdown-command-${encodedName}`,
		title: optionalString(frontmatter.title, 'title', source) ?? humanize(name),
		category: optionalString(frontmatter.category, 'category', source) ?? 'Markdown commands',
		description: optionalString(frontmatter.description, 'description', source),
		argumentHint: optionalString(frontmatter['argument-hint'], 'argument-hint', source),
		template,
		source,
	}
}

export async function loadCommandDirectory(
	directory: string,
	onError: (error: unknown, source: string) => void = () => {},
): Promise<MarkdownCommand[]> {
	let entries
	try {
		entries = await readdir(directory, { recursive: true, withFileTypes: true })
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}

	const commands: MarkdownCommand[] = []
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) continue

		const source = resolve(entry.parentPath, entry.name)
		const name = relative(directory, source).split(sep).join('/').slice(0, -3)
		try {
			commands.push(parseMarkdownCommand(await readFile(source, 'utf8'), source, name))
		} catch (error) {
			onError(error, source)
		}
	}

	return commands.sort((left, right) => left.name.localeCompare(right.name))
}

export function hasArguments(template: string): boolean {
	return /\$ARGUMENTS|\$\d+/.test(template)
}

export function splitArguments(input: string): string[] {
	const values: string[] = []
	let current = ''
	let quote: '"' | "'" | undefined
	let tokenStarted = false

	for (let index = 0; index < input.length; index += 1) {
		const character = input[index]
		if (quote) {
			if (character === quote) quote = undefined
			else if (
				quote === '"' &&
				character === '\\' &&
				(input[index + 1] === '"' || input[index + 1] === '\\')
			) {
				current += input[index + 1]
				index += 1
			} else current += character
			continue
		}
		if (character === '"' || character === "'") {
			quote = character
			tokenStarted = true
			continue
		}
		if (
			character === '\\' &&
			input[index + 1] !== undefined &&
			/[\s\\"']/.test(input[index + 1])
		) {
			current += input[index + 1]
			tokenStarted = true
			index += 1
			continue
		}
		if (/\s/.test(character)) {
			if (tokenStarted) {
				values.push(current)
				current = ''
				tokenStarted = false
			}
			continue
		}
		current += character
		tokenStarted = true
	}

	if (tokenStarted) values.push(current)
	return values
}

export function renderTemplate(template: string, input: string): string {
	const argumentsByPosition = splitArguments(input)
	return template.replace(/\$ARGUMENTS|\$(\d+)/g, (placeholder, position: string | undefined) => {
		if (placeholder === '$ARGUMENTS') return input
		return argumentsByPosition[Number(position) - 1] ?? ''
	})
}
