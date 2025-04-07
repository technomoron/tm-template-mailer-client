import emailAddresses, { ParsedMailbox } from 'email-addresses';
import nunjucks from 'nunjucks';

interface TemplateData {
	template: string;
	domain: string;
	sender?: string;
	name?: string;
	subject?: string;
	locale?: string;
	part?: boolean;
}

interface SendTemplateData {
	name: string;
	rcpt: string;
	domain: string;
	locale?: string;
	vars?: object;
}

type FetchResult = { result: any; error: string | null };

class TemplateClient {
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
		const senderPattern = /^[^<>]+<[^<>]+@[^<>]+\.[^<>]+>$/;
		if (!senderPattern.test(sender)) {
			throw new Error(
				'Invalid sender format. Expected "Name <email@example.com>"',
			);
		}
	}

	async postTemplate(templateData: TemplateData): Promise<any> {
		console.log('TEMPLATE');
		const {
			template,
			sender = '',
			domain,
			name,
			subject,
			locale,
			part
		} = templateData;
		if (!template) {
			throw new Error('No template data provided');
		}

		this.validateTemplate(template);
		if (sender) {
			this.validateSender(sender);
		}

		const result = await this.post('/api/v1/template', templateData);
		// console.log(JSON.stringify(result, undefined, 2));
		return result;
	}

	async postSend(templateData: SendTemplateData): Promise<any> {
		console.log('SENDING');
		const {
			name = '',
			domain = '',
			rcpt = '',
			locale = '',
			vars = {},
		} = templateData;

		if (!name || !rcpt) {
			throw new Error('Invalid request body');
		}

		const { valid, invalid } = this.validateEmails(rcpt);
		if (invalid.length > 0) {
			console.log('Invalid email address(es): ' + invalid.join(','));
			process.exit(1);
		}

		// this.validateTemplate(template);

		const body = JSON.stringify({
			name,
			rcpt,
			domain,
			locale,
			vars,
		});
		// console.log(JSON.stringify(body, undefined, 2));
		const result = await this.post('/api/v1/send', templateData);
		// console.log(JSON.stringify(result, undefined, 2));

		return result;
	}
}

export default TemplateClient;
