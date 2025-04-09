import emailAddresses, { ParsedMailbox } from 'email-addresses';
import nunjucks from 'nunjucks';

interface templateData {
	template: string;
	domain: string;
	sender?: string;
	name?: string;
	subject?: string;
	locale?: string;
	part?: boolean;
}

interface sendTemplateData {
	name: string;
	rcpt: string;
	domain: string;
	locale?: string;
	vars?: object;
}

type fetchResult = { result: any; error: string | null };

class templateClient {
	private baseURL: string;
	private apiKey: string;

	constructor(baseURL: string, apiKey: string) {
		this.baseURL = baseURL;
		this.apiKey = apiKey;
		if (!apiKey || !baseURL) {
			throw new Error('Apikey/api-url required');
		}
	}

	async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', command: string, body?: any): Promise<T> {
		const url = `${this.baseURL}${command}`;
		const options: RequestInit = {
			method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer apikey-${this.apiKey}`,
			},
			body: body ? JSON.stringify(body) : '{}',
		};
		//        console.log(JSON.stringify({ options, url }));
		const response = await fetch(url, options);
		const j = await response.json();
		if (response.ok) {
			return j;
		}
		// console.log(JSON.stringify(j, undefined, 2));
		if (j && j.message) {
			throw new Error(`FETCH FAILED: ${response.status} ${j.message}`);
		} else {
			throw new Error(`FETCH FAILED: ${response.status} ${response.statusText}`);
		}
	}

	async get<T>(command: string): Promise<T> {
		return this.request<T>('GET', command);
	}

	async post<T>(command: string, body: any): Promise<T> {
		return this.request<T>('POST', command, body);
	}

	async put<T>(command: string, body: any): Promise<T> {
		return this.request<T>('PUT', command, body);
	}

	async delete<T>(command: string, body?: any): Promise<T> {
		return this.request<T>('DELETE', command, body);
	}

	validateEmails(list: string): { valid: string[]; invalid: string[] } {
		const valid = [] as string[],
			invalid = [] as string[];

		const emails = list
			.split(',')
			.map((email) => email.trim())
			.filter((email) => email !== '');
		emails.forEach((email) => {
			const parsed = emailAddresses.parseOneAddress(email);
			if (parsed && (parsed as ParsedMailbox).address) {
				valid.push((parsed as ParsedMailbox).address);
			} else {
				invalid.push(email);
			}
		});
		return { valid, invalid };
	}

	private validateTemplate(template: string): void {
		try {
			const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(['./templates']));
			const t = env.renderString(template, {});
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Template validation failed: ${error.message}`);
			} else {
				throw new Error(
					'Template validation failed with an unknown error',
				);
			}
		}
	}

	private validateSender(sender: string): void {
		const exp = /^[^<>]+<[^<>]+@[^<>]+\.[^<>]+>$/;
		if (!exp.test(sender)) {
			throw new Error(
				'Invalid sender format. Expected "Name <email@example.com>"',
			);
		}
	}

	async storeTemplate(td: templateData): Promise<any> {
		if (!td.template) {
			throw new Error('No template data provided');
		}
		this.validateTemplate(td.template);
		if (td.sender) {
			this.validateSender(td.sender);
		}
		const result = await this.post('/api/v1/template', td);
		return result;
	}

	async sendTemplate(std: sendTemplateData): Promise<any> {
		if (!std.name || !std.rcpt) {
			throw new Error('Invalid request body; name/rcpt required');
		}

		const { valid, invalid } = this.validateEmails(std.rcpt);
		if (invalid.length > 0) {
			throw new Error('Invalid email address(es): ' + invalid.join(','));
		}

		// this.validateTemplate(template);

		const body = JSON.stringify({
			name: std.name,
			rcpt: std.rcpt,
			domain: std.domain || '',
			locale: std.locale || '',
			vars: std.vars || {},
		});
		// console.log(JSON.stringify(body, undefined, 2));
		const result = await this.post('/api/v1/send', body);
		// console.log(JSON.stringify(result, undefined, 2));
		return result;
	}
}

export default templateClient;
