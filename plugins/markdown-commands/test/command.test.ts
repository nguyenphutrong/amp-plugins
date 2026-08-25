import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	hasArguments,
	loadCommandDirectory,
	parseMarkdownCommand,
	renderTemplate,
	splitArguments,
} from '../src/command'

describe('parseMarkdownCommand', () => {
	test('uses frontmatter and derives a stable ID', () => {
		const command = parseMarkdownCommand(
			`---
title: Review pull request
category: GitHub
description: Review one pull request
argument-hint: "<number> [focus]"
---
Review PR $1. Focus on $2.`,
			'/repo/.amp/commands/github/review-pr.md',
			'github/review-pr',
		)

		expect(command).toMatchObject({
			title: 'Review pull request',
			category: 'GitHub',
			description: 'Review one pull request',
			argumentHint: '<number> [focus]',
			template: 'Review PR $1. Focus on $2.',
		})
		expect(Buffer.from(command.id.slice('markdown-command-'.length), 'base64url').toString('utf8')).toBe(
			'github/review-pr',
		)
	})

	test('generates distinct IDs for names that previously collided', () => {
		const names = ['a/b', 'a--b', 'foo bar', 'foo.bar', '测试', '命令']
		const ids = names.map((name) => parseMarkdownCommand('Run.', `${name}.md`, name).id)
		expect(new Set(ids).size).toBe(names.length)
	})

	test('derives labels when frontmatter is absent', () => {
		const command = parseMarkdownCommand('Run the tests.', 'test.md', 'quality/run-tests')
		expect(command.title).toBe('Quality / Run Tests')
		expect(command.category).toBe('Markdown commands')
	})

	test('rejects an empty prompt', () => {
		expect(() => parseMarkdownCommand('---\ndescription: Empty\n---\n', 'empty.md', 'empty')).toThrow(
			'command prompt is empty',
		)
	})
})

describe('loadCommandDirectory', () => {
	test('loads nested commands and skips invalid files', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'amp-markdown-commands-'))
		const errors: string[] = []
		try {
			await mkdir(join(directory, 'git'))
			await writeFile(join(directory, 'git', 'review.md'), 'Review the current changes.')
			await writeFile(join(directory, 'broken.md'), '---\ndescription: Broken')

			const commands = await loadCommandDirectory(directory, (_error, source) => errors.push(source))

			expect(commands.map((command) => command.name)).toEqual(['git/review'])
			expect(errors).toEqual([join(directory, 'broken.md')])
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})

describe('arguments', () => {
	test('splits quoted and escaped values', () => {
		expect(splitArguments(`one "two words" 'three words' four\\ five`)).toEqual([
			'one',
			'two words',
			'three words',
			'four five',
		])
	})

	test('preserves empty arguments and Windows paths', () => {
		expect(splitArguments(String.raw`one "" three "C:\repo\src" C:\other\file`)).toEqual([
			'one',
			'',
			'three',
			String.raw`C:\repo\src`,
			String.raw`C:\other\file`,
		])
	})

	test('renders all and positional arguments', () => {
		expect(renderTemplate('All: $ARGUMENTS; first: $1; second: $2; missing: $3', '123 "high priority"')).toBe(
			'All: 123 "high priority"; first: 123; second: high priority; missing: ',
		)
	})

	test('detects templates that need input', () => {
		expect(hasArguments('Review $ARGUMENTS')).toBe(true)
		expect(hasArguments('Review $1')).toBe(true)
		expect(hasArguments('Run tests')).toBe(false)
	})
})
