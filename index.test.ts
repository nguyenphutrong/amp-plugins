import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import markdownCommandsPlugin from './index'

const originalConfigHome = process.env.XDG_CONFIG_HOME

afterEach(() => {
	if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
	else process.env.XDG_CONFIG_HOME = originalConfigHome
})

describe('markdownCommandsPlugin', () => {
	test('registers commands, applies project precedence, and targets the correct thread', async () => {
		const root = await mkdtemp(join(tmpdir(), 'amp-markdown-plugin-'))
		const configHome = join(root, 'config')
		const workspace = join(root, 'workspace')
		const userCommands = join(configHome, 'amp', 'commands')
		const projectCommands = join(workspace, '.amp', 'commands')
		process.env.XDG_CONFIG_HOME = configHome

		try {
			await mkdir(join(userCommands, 'a'), { recursive: true })
			await mkdir(projectCommands, { recursive: true })
			await writeFile(join(userCommands, 'shared.md'), 'User prompt $ARGUMENTS')
			await writeFile(join(projectCommands, 'shared.md'), 'Project prompt $ARGUMENTS')
			await writeFile(join(userCommands, 'a', 'b.md'), 'Nested command')
			await writeFile(join(userCommands, 'a--b.md'), 'Flat command')
			await writeFile(join(userCommands, 'new-thread.md'), 'Start a new thread')

			const registered = new Map<
				string,
				{ id: string; handler: (ctx: Record<string, unknown>) => Promise<void> }
			>()
			const activeMessages: string[] = []
			const newThreadMessages: string[] = []
			const createdModes: string[] = []
			const createOptions: unknown[] = []
			const logs: unknown[][] = []

			const amp = {
				system: { workspaceRoot: { toString: () => 'file:///workspace' } },
				helpers: { filePathFromURI: () => workspace },
				logger: { log: (...values: unknown[]) => logs.push(values) },
				registerCommand: (
					id: string,
					options: { title: string },
					handler: (ctx: Record<string, unknown>) => Promise<void>,
				) => {
					registered.set(options.title, { id, handler })
				},
				getBuiltinAgent: (mode: string) => {
					createdModes.push(mode)
					return {
						createThread: async (options: unknown) => {
							createOptions.push(options)
							return {
								appendUserMessage: async ({ content }: { content: string }) => {
									newThreadMessages.push(content)
								},
							}
						},
					}
				},
			}

			await markdownCommandsPlugin(amp as never)

			expect(registered.size).toBe(4)
			expect(registered.get('A / B')?.id).not.toBe(registered.get('A B')?.id)

			const shared = registered.get('Shared')
			expect(shared).toBeDefined()
			await shared?.handler({
				ui: { input: async () => 'focus' },
				thread: {
					appendUserMessage: async ({ content }: { content: string }) => activeMessages.push(content),
				},
			})
			expect(activeMessages).toEqual(['Project prompt focus'])

			await shared?.handler({
				ui: { input: async () => undefined },
				thread: {
					appendUserMessage: async ({ content }: { content: string }) => activeMessages.push(content),
				},
			})
			expect(activeMessages).toEqual(['Project prompt focus'])

			await shared?.handler({
				ui: { input: async () => '' },
				thread: {
					appendUserMessage: async ({ content }: { content: string }) => activeMessages.push(content),
				},
			})
			expect(activeMessages).toEqual(['Project prompt focus', 'Project prompt '])

			await registered.get('New Thread')?.handler({ ui: { input: async () => '' } })
			expect(createdModes).toEqual(['medium'])
			expect(createOptions).toEqual([{ show: true }])
			expect(newThreadMessages).toEqual(['Start a new thread'])
			expect(logs.at(-1)).toEqual(['Registered 4 Markdown command(s)'])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})
})
