/*
 *  Merge templates in source dir using nunjucks blocks and layouts.
 *
 *  We need the templates to become single files, but flow control and
 *  variable expansion to be preserved so we can use the merged templates
 *  for dynamic data later.
 *
 */

import nunjucks from 'nunjucks';

const fs = require('fs');
const path = require('path');

const inky = require('inky').Inky;
const juice = require('juice');
const cheerio = require('cheerio');

interface ExtendedTemplate extends nunjucks.Template {
	tmplStr: string;
}

interface ExtendedEnvironment extends nunjucks.Environment {
	filters: {
		[key: string]: (...args: any[]) => any;
		protect_variables: (content: string) => string;
		restore_variables: (content: string) => string;
	};
	getTemplate(name: string, eagerCompile?: boolean): ExtendedTemplate;
}

interface compilecfg {
	env: ExtendedEnvironment | null;
	src_dir: string;
	dist_dir: string;
	css_path: string;
	css_content: string | null;
}

// Encapsulate global data in a config object
const cfg: compilecfg = {
	env: null,
	src_dir: 'templates',
	dist_dir: 'templates-dist',
	css_path: path.join(process.cwd(), 'templates', 'foundation-emails.css'),
	css_content: null
};

//
// Override nunjucks own template merging and merge manually to preserve
// flow control and variable expansion.
//
// Warn: recursive, but does not check for loops so beware of circular
// references in templates.
//

class PreprocessExtension {
	tags: string[] = [];
	constructor() {
		this.tags = ['process_layout'];
	}

	parse(parser, nodes) {
		const token = parser.nextToken();
		const args = parser.parseSignature(null, true);
		parser.advanceAfterBlockEnd(token.value);

		return new nodes.CallExtension(this, 'run', args);
	}

	run(context, tplname) {
		const template = cfg.env!.getTemplate(tplname);
		const src = template.tmplStr;

		// Find all extends statements (just care about first)
		const extmatch = src.match(/\{%\s*extends\s+['"]([^'"]+)['"]\s*%\}/);
		if (!extmatch) {
			return src; // No extends, return as is
		}

		const layoutName = extmatch[1];
		const layoutTemplate = cfg.env!.getTemplate(layoutName);
		const layoutSrc = layoutTemplate.tmplStr;

		// Find all blocks in the template
		const blocks: Record<string, string> = {};
		const blockexp = /\{%\s*block\s+([a-zA-Z0-9_]+)\s*%\}([\s\S]*?)\{%\s*endblock\s*%\}/g;

		let match;
		while ((match = blockexp.exec(src)) !== null) {
			const bname = match[1];
			const bcontent = match[2];
			blocks[bname] = bcontent.trim();
		}

		// Replace blocks in the layout with content from the template
		let merged = layoutSrc;
		for (const [bname, bcontent] of Object.entries(blocks) as [string, string][]) {
			const lbexpt = new RegExp(
				`\\{%\\s*block\\s+${bname}\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}`, 'g'
			);
			merged = merged.replace(lbexpt, bcontent);
		}

		// Remove the extends statement
		merged = merged.replace(/\{%\s*extends\s+['"][^'"]+['"]\s*%\}/, '');

		// If the layout itself extends another template, continue resolving
		if (merged.match(/\{%\s*extends\s+['"]([^'"]+)['"]\s*%\}/)) {
			return this.run(context, layoutName);
		}

		// Remove any remaining empty blocks
		merged = merged.replace(/\{%\s*block\s+([a-zA-Z0-9_]+)\s*%\}\s*\{%\s*endblock\s*%\}/g, '');

		return merged;
	}
}

function process_template(tplname: string) {
        console.log(`Processing template: ${tplname}`);

        try {
        //
        // Step 1: Resolve template inheritance completely
        // This creates a single complete template with no extends/block statements
        //
                const mergedTemplate = cfg.env!.renderString(
                        `{% process_layout "${tplname}.njk" %}`,
                        {}
                );

                //
                // Step 2: Protect variables and flow control
                //
                const protectedTemplate = cfg.env!.filters.protect_variables(mergedTemplate);

                //
                // Step 3: Process HTML with manual Foundation for Emails conversion
                // Instead of using Inky which is causing errors
                //
                console.log("Processing HTML for email compatibility");
                
                let processedHtml = protectedTemplate;
                
                try {
                    const $ = cheerio.load(protectedTemplate, {
                        xmlMode: false,
                        decodeEntities: false
                    });
                    
                    // Manual conversion of Foundation for Emails components to HTML tables
                    
                    // Convert <container> to table
                    $('container').each(function(this: any) {
                        const $container = $(this);
                        const attrs = getAttributes($container);
                        
                        const $table = $('<table/>').attr({
                            'align': 'center',
                            'class': $container.attr('class') || '',
                            'width': '100%',
                            'cellpadding': '0',
                            'cellspacing': '0',
                            'border': '0'
                        });
                        
                        const $tbody = $('<tbody/>');
                        $table.append($tbody);
                        
                        // Move all children to the tbody
                        $tbody.append($container.contents());
                        
                        // Replace the container with the table
                        $container.replaceWith($table);
                    });
                    
                    // Convert <row> to tr
                    $('row').each(function(this: any) {
                        const $row = $(this);
                        const attrs = getAttributes($row);
                        const background = $row.attr('background') || '';
                        
                        const $tr = $('<tr/>').attr({
                            'class': $row.attr('class') || ''
                        });
                        
                        if (background) {
                            $tr.css('background', background);
                        }
                        
                        // Move all children to the tr
                        $tr.append($row.contents());
                        
                        // Replace the row with the tr
                        $row.replaceWith($tr);
                    });
                    
                    // Convert <columns> to td
                    $('columns').each(function(this: any) {
                        const $columns = $(this);
                        const attrs = getAttributes($columns);
                        const padding = $columns.attr('padding') || '0';
                        
                        const $td = $('<td/>').attr({
                            'class': $columns.attr('class') || '',
                            'style': `padding: ${padding};`
                        });
                        
                        // Move all children to the td
                        $td.append($columns.contents());
                        
                        // Replace the columns with the td
                        $columns.replaceWith($td);
                    });
                    
                    // Convert <button> to link
                    $('button').each(function(this: any) {
                        const $button = $(this);
                        const attrs = getAttributes($button);
                        const href = $button.attr('href') || '#';
                        const buttonClass = $button.attr('class') || '';
                        
                        const $a = $('<a/>').attr({
                            'href': href,
                            'class': buttonClass,
                            'style': $button.attr('style') || 'display: inline-block; padding: 8px 16px; border-radius: 3px; text-decoration: none;'
                        });
                        
                        // Move all children to the link
                        $a.append($button.contents());
                        
                        // Replace the button with the link
                        $button.replaceWith($a);
                    });
                    
                    // Helper function to get all attributes of an element
                    function getAttributes($element: any) {
                        const attributes: {[key: string]: string} = {};
                        if ($element[0] && $element[0].attribs) {
                            Object.keys($element[0].attribs).forEach(key => {
                                attributes[key] = $element[0].attribs[key];
                            });
                        }
                        return attributes;
                    }
                    
                    processedHtml = $.html();
                    console.log("HTML processing complete");
                    
                } catch (htmlError) {
                    console.error("HTML processing error:", htmlError);
                    // Continue with original HTML if processing fails
                    processedHtml = protectedTemplate;
                }

                //
                // Step 4: Inline CSS
                //
                let inlinedHtml;
                try {
                    inlinedHtml = juice(processedHtml, {
                        extraCss: cfg.css_content,
                        removeStyleTags: false,
                        preserveMediaQueries: true,
                        preserveFontFaces: true
                    });
                } catch (juiceError) {
                    console.error("CSS inlining error:", juiceError);
                    inlinedHtml = processedHtml;
                }

                //
                // Step 5: Restore variables and flow control
                //
                const finalHtml = cfg.env!.filters.restore_variables(inlinedHtml);

                // Write the processed template
                const outputPath = path.join(process.cwd(), cfg.dist_dir, `${tplname}.njk`);
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, finalHtml);

                console.log(`Created ${tplname}.njk`);
                return finalHtml;
        } catch (error) {
                console.error(`Error processing ${tplname}:`, error);
                throw error;
        }
}

function get_all_files(dir, filelist: string[] = []): string[] {
	const files = fs.readdirSync(dir);
	files.forEach(file => {
		const file_path = path.join(dir, file);
		if (fs.statSync(file_path).isDirectory()) {
			get_all_files(file_path, filelist);
		} else {
			filelist.push(file_path);
		}
	});
	return filelist;
}

function find_templates() {
	const all = get_all_files(path.join(process.cwd(), cfg.src_dir));

	return all
		.filter(file => file.endsWith('.njk'))
		.filter(file => {
			const basename = path.basename(file);
			const content = fs.readFileSync(file, 'utf8');

			// Include files that extend layouts but are not layouts themselves
			return !basename.startsWith('_') &&
             !basename.includes('layout') &&
             !basename.includes('part') &&
             content.includes('{% extends');
		})
		.map(file => {
			const name = path.relative(cfg.src_dir, file);
			return name.substring(0, name.length - 4);
		});
}

async function process_all_templates() {
	if (!fs.existsSync(cfg.dist_dir)) {
		fs.mkdirSync(cfg.dist_dir, { recursive: true });
	}

	const templates = find_templates();
	console.log(`Found ${templates.length} templates to process: ${templates.join(', ')}`);

	for (const template of templates) {
		try {
			process_template(template);
		} catch (error) {
			console.error(`Failed to process ${template}:`, error);
		}
	}
	console.log('All templates processed!');
}

function init_env() {
	// cfg.env = new nunjucks.Environment(new nunjucks.FileSystemLoader(cfg.src_dir), {
	const loader = new nunjucks.FileSystemLoader(path.join(process.cwd(), cfg.src_dir));
	cfg.env = new nunjucks.Environment(loader, {
		autoescape: false
	}) as ExtendedEnvironment;

	if (!cfg.env) {
		throw Error('Unable to init nunjucks environment');
	}

	// Load CSS
	cfg.css_content = fs.readFileSync(cfg.css_path, 'utf8');

	// Add custom extension to Nunjucks
	cfg.env.addExtension('PreprocessExtension', new PreprocessExtension());

	// Add custom filters
	cfg.env.addFilter('protect_variables', function (content) {
		return content
			.replace(/(\{\{[\s\S]*?\}\})/g, (match) => {
				// Encode variables {{ var }}
				return `<!--VAR:${Buffer.from(match).toString('base64')}-->`;
			})
			.replace(/(\{%(?!\s*block|\s*endblock|\s*extends)[\s\S]*?%\})/g, (match) => {
				// Encode flow control (if, for, etc) but not block/extends
				return `<!--FLOW:${Buffer.from(match).toString('base64')}-->`;
			});
	});

	cfg.env.addFilter('restore_variables', function (content) {
		return content
			.replace(/<!--VAR:(.*?)-->/g, (match, encoded) => {
				return Buffer.from(encoded, 'base64').toString('utf8');
			})
			.replace(/<!--FLOW:(.*?)-->/g, (match, encoded) => {
				return Buffer.from(encoded, 'base64').toString('utf8');
			});
	});
}

export async function do_the_template_thing(options: {
	src_dir?: string,
	dist_dir?: string,
	css_path?: string,
	tplname?: string
} = {}) {
	if (options.src_dir) cfg.src_dir = options.src_dir;
	if (options.dist_dir) cfg.dist_dir = options.dist_dir;
	if (options.css_path) cfg.css_path = options.css_path;

	init_env();

	if (options.tplname) {
		process_template(options.tplname);
	} else {
		await process_all_templates();
	}
}
