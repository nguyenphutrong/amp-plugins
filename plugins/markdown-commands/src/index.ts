import type { PluginAPI, PluginCommandContext, PluginThread } from '@ampcode/plugin'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
	hasArguments,
	loadCommandDirectory,
	type MarkdownCommand,
	renderTemplate,
} from './command'

export const description = 'Registers reusable Amp command-palette prompts from Markdown files.'

function userCommandsDirectory(): string {
	const configHome = process.env.XDG_CONFIG_HOME
	if (configHome) return join(configHome, 'amp', 'commands')
	return join(homedir(), '.config', 'amp', 'commands')
}

async function promptForArguments(
	command: MarkdownCommand,
	ctx: PluginCommandContext,
): Promise<string | undefined> {
	if (!hasArguments(command.template)) return ''
	return ctx.ui.input({
		title: command.title,
		helpText: command.argumentHint ?? 'Enter command arguments.',
		submitButtonText: 'Run command',
	})
}

async function targetThread(amp: PluginAPI, ctx: PluginCommandContext): Promise<PluginThread> {
	if (ctx.thread) return ctx.thread
	return amp.getBuiltinAgent('medium').createThread({ show: true })
}

export default async function markdownCommandsPlugin(amp: PluginAPI) {
	const userDirectory = userCommandsDirectory()
	const workspaceRoot = amp.system.workspaceRoot
		? amp.helpers.filePathFromURI(amp.system.workspaceRoot)
		: undefined
	const projectDirectory = workspaceRoot ? join(workspaceRoot, '.amp', 'commands') : undefined

	const commandsByName = new Map<string, MarkdownCommand>()
	for (const directory of [userDirectory, projectDirectory]) {
		if (!directory) continue
		try {
			const commands = await loadCommandDirectory(directory, (error, source) => {
				amp.logger.log(`Skipping invalid Markdown command ${source}:`, error)
			})
			for (const command of commands) {
				commandsByName.set(command.name, command)
			}
		} catch (error) {
			amp.logger.log(`Could not load Markdown commands from ${directory}:`, error)
		}
	}

	for (const command of commandsByName.values()) {
		amp.registerCommand(
			command.id,
			{
				title: command.title,
				category: command.category,
				description: command.description,
			},
			async (ctx) => {
				const input = await promptForArguments(command, ctx)
				if (input === undefined) return

				const prompt = renderTemplate(command.template, input)
				const thread = await targetThread(amp, ctx)
				await thread.appendUserMessage({ type: 'user-message', content: prompt })
			},
		)
	}

	amp.logger.log(`Registered ${commandsByName.size} Markdown command(s)`)
}
