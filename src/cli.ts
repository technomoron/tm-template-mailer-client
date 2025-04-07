#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';

import { Command } from 'commander';

import TemplateClient from './tm-template-mailer-client';
import { do_the_template_thing } from './preprocess';

const program = new Command();

program
	.option('-a, --api <api>', 'Base API endpoint', 'http://localhost:3000')
	.option(
		'-t, --token <token>',
		'Authentication token in the format "username:token"',
	)
	.option(
		'-f, --file <file>',
		'Path to the file containing the template data (Nunjucks with MJML)',
	)
	.option('-s, --sender <sender>', 'Sender email address')
	.option('-r, --rcpt <rcpt>', 'Recipient email addresses (comma-separated)')
	.option('-n, --name <name>', 'Template name')
	.option('-b, --subject <subject>', 'Email subject')
	.option('-l, --locale <locale>', 'Locale')
	.option('-d, --domain <domain>', 'Domain')
	.option('-p, --part <true|false>', 'Part')
	.option('-v, --vars <vars>', 'Template parameters (JSON string)');

const readStdin = async (): Promise<string> => {
	if (process.stdin.isTTY) {
		return '';
	}
	return new Promise((resolve, reject) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: false,
		});
		let data = '';
		rl.on('line', (line) => {
			data += line + '\n';
		});
		rl.on('close', () => {
			resolve(data.trim());
		});
		rl.on('error', (err) => {
			reject(err);
		});
	});
};

const getTemplateData = async (): Promise<string> => {
	if (program.opts().file) {
		const filePath = program.opts().file;
		if (!fs.existsSync(filePath)) {
			throw new Error(`File not found: ${filePath}`);
		}
		return fs.readFileSync(filePath, 'utf-8');
	} else {
		return await readStdin();
	}
};

program
	.command('template')
	.description('Store a template on the server')
	.action(async () => {
		const client = new TemplateClient(program.opts().api, program.opts().token);
		try {
			const template = await getTemplateData();
			const templateData = {
				template,
				sender: program.opts().sender,
				name: program.opts().name,
				subject: program.opts().subject,
				locale: program.opts().locale,
				domain: program.opts().domain,
				part: !!program.opts().part,
			};
			const result = await client.postTemplate(templateData);
			console.log('Template updated');
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program.command('send')
	.description('Send a template to recipients')
	.action(async () => {
		const client = new TemplateClient(program.opts().api, program.opts().token);
		try {
			const template = await getTemplateData();
			const vars: any = program.opts().vars ? JSON.parse(program.opts().vars) : '{}';
			const templateData = {
				name: program.opts().name,
				rcpt: program.opts().rcpt,
				domain: program.opts().domain,
				locale: program.opts().locale,
				vars,
			};
			const result = await client.postSend(templateData);
			console.log('Template sent');
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program.command('compile')
	.description('Compile templates by resolving inheritance and processing with FFE')
	.option('-i, --input <input>', 'Input directory', './templates')
	.option('-o, --output <output>', 'Output directory', './templates-dist')
	.option('-c, --css <css>', 'Path to Foundation for Emails CSS', './templates/foundation-emails.css')
	.option('-t, --template <template>', 'Process a specific template only')
	.action(async (cmdOptions) => {
		try {
			await do_the_template_thing({
				src_dir: cmdOptions.input,
				dist_dir: cmdOptions.output,
				css_path: cmdOptions.css,
				tplname: cmdOptions.template // Pass undefined if not specified
			});
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program.parse(process.argv);
