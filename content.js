(function() {
    // Re-injection guard
    if (window.__scraperLLMRunning) {
        return { error: 'Already scraping' };
    }
    window.__scraperLLMRunning = true;

    function cleanText(text) {
        return text ? text.replace(/\s+/g, ' ').trim() : "";
    }

    function parseMetadata() {
        const fullTitle = document.title || "Untitled";
        let title = fullTitle;
        let author = "Unknown Author";

        // 1. Try JSON-LD structured data
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    // Check author, then organizer (events), then publisher (articles)
                    for (const field of ['author', 'organizer', 'publisher']) {
                        if (item[field] && author === "Unknown Author") {
                            const obj = Array.isArray(item[field]) ? item[field][0] : item[field];
                            if (typeof obj === 'string') author = obj;
                            else if (obj && obj.name) author = obj.name;
                        }
                    }
                    if (item.headline) title = item.headline;
                }
                if (author !== "Unknown Author") break;
            } catch (e) {}
        }

        // 2. Try "| by" pattern in document.title
        if (author === "Unknown Author" && fullTitle.includes('| by')) {
            const parts = fullTitle.split('|');
            title = parts[0].trim();
            const authorPart = parts.find(p => p.trim().startsWith('by '));
            if (authorPart) {
                author = authorPart.replace('by ', '').trim();
            }
        }

        // 3. Try meta tags
        if (author === "Unknown Author") {
            const authorMeta = document.querySelector('meta[name="author"]') ||
                              document.querySelector('meta[property="article:author"]') ||
                              document.querySelector('meta[name="citation_author"]');
            if (authorMeta) author = authorMeta.content;
        }

        // 4. Try rel="author" link or common author selectors
        if (author === "Unknown Author") {
            const authorEl = document.querySelector('a[rel="author"]') ||
                            document.querySelector('.author-name') ||
                            document.querySelector('.post-author') ||
                            document.querySelector('[itemprop="author"]');
            if (authorEl) author = authorEl.textContent.trim();
        }

        // 5. Fallback: find visible "by X" text near the top of the page
        if (author === "Unknown Author") {
            const byEl = Array.from(document.querySelectorAll('p, span, div'))
                .find(el => /^by\s+\S/i.test((el.innerText || '').trim()) && (el.innerText || '').trim().length < 60);
            if (byEl) author = byEl.innerText.trim().replace(/^by\s+/i, '').trim();
        }

        return { title, author };
    }

    function htmlToMarkdown(node, isRoot = false, indent = 0) {
        // Text node
        if (node.nodeType === 3) {
            return node.nodeValue.replace(/\s+/g, ' ');
        }
        if (node.nodeType !== 1) return "";

        // Skip invisible elements — catches responsive duplicates (d-none, d-lg-none, etc.)
        const cs = window.getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return "";

        const tag = node.tagName.toLowerCase();

        // --- Noise removal (structural) ---
        const badTags = ['style', 'script', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'aside', 'form', 'button'];
        if (badTags.includes(tag)) return "";

        const badClasses = ['ad-wrapper', 'menu', 'nav', 'footer', 'promo', 'cookie-banner', 'subscribe-box'];
        if (!isRoot && node.className && typeof node.className === 'string') {
            const clsLower = node.className.toLowerCase();
            if (badClasses.some(bad => clsLower.includes(bad))) return "";
            if (node.getAttribute('role') === 'dialog') return "";
        }

        // --- Noise removal (text content) ---
        const nodeText = node.innerText || "";
        if (nodeText.length < 400) {
            if (nodeText.includes("Go to the original") ||
                nodeText.includes("Preview image") ||
                nodeText.includes("min read") ||
                nodeText.includes("Milestone:") ||
                (tag !== 'time' && nodeText.includes("Updated:") && nodeText.length < 50)) {
                return "";
            }
        }

        // --- Process children ---
        let childText = "";
        node.childNodes.forEach(child => {
            childText += htmlToMarkdown(child, false, indent);
        });

        // Skip empty elements
        if (!childText.trim() && tag !== 'img' && tag !== 'hr' && tag !== 'br') return "";

        // --- Markdown formatting ---
        const indentStr = '  '.repeat(indent);

        switch (tag) {
            case 'h1': return `\n\n---\n\n# ${childText.trim()}\n\n`;
            case 'h2': return `\n\n---\n\n## ${childText.trim()}\n\n`;
            case 'h3': return `\n### ${childText.trim()}\n\n`;
            case 'h4': case 'h5': case 'h6': return `\n#### ${childText.trim()}\n\n`;

            case 'p':
                if (childText.trim().startsWith('Written by') && childText.length < 50) return `_${childText.trim()}_\n\n`;
                if (childText.includes('·') && childText.length < 50) return "";
                return `${childText.trim()}\n\n`;

            case 'b': case 'strong': return `**${childText.trim()}**`;
            case 'i': case 'em': return `_${childText.trim()}_`;

            case 'a':
                const href = node.getAttribute('href');
                if (!href || href.startsWith('#')) return childText;
                return `[${childText.trim()}](${href})`;

            case 'ul':
                return '\n' + Array.from(node.children)
                    .filter(li => li.tagName && li.tagName.toLowerCase() === 'li')
                    .map(li => {
                        const nestedList = li.querySelector('ul, ol');
                        if (nestedList) {
                            const clone = li.cloneNode(true);
                            clone.querySelectorAll('ul, ol').forEach(l => l.remove());
                            const text = clone.innerText.trim();
                            const nested = htmlToMarkdown(nestedList, false, indent + 1);
                            return `${indentStr}- ${text}${nested}`;
                        }
                        return `${indentStr}- ${li.innerText.trim()}`;
                    }).join('\n') + '\n\n';

            case 'ol':
                return '\n' + Array.from(node.children)
                    .filter(li => li.tagName && li.tagName.toLowerCase() === 'li')
                    .map((li, i) => {
                        const nestedList = li.querySelector('ul, ol');
                        if (nestedList) {
                            const clone = li.cloneNode(true);
                            clone.querySelectorAll('ul, ol').forEach(l => l.remove());
                            const text = clone.innerText.trim();
                            const nested = htmlToMarkdown(nestedList, false, indent + 1);
                            return `${indentStr}${i + 1}. ${text}${nested}`;
                        }
                        return `${indentStr}${i + 1}. ${li.innerText.trim()}`;
                    }).join('\n') + '\n\n';

            case 'blockquote': return `\n> ${childText.trim()}\n\n`;
            case 'code': return `\`${childText}\``;
            case 'pre':
                let rawCode = node.innerText.replace(/^Copy\s*[\r\n]*/i, '');
                return `\n\`\`\`\n${rawCode}\n\`\`\`\n\n`;

            case 'figure': return `\n${childText}\n`;
            case 'figcaption': return `\n*Caption: ${childText.trim()}*\n`;
            case 'img': {
                // Prefer src, fall back to data-src / data-lazy-src for lazy-loaded images
                const src = node.getAttribute('src') ||
                            node.getAttribute('data-src') ||
                            node.getAttribute('data-lazy-src') || '';
                if (!src || src.startsWith('data:')) return ''; // skip inline blobs & tracking pixels
                // Skip tiny images (icons, spacers, tracking pixels ≤ 20 px)
                const w = parseInt(node.getAttribute('width') || '0');
                const h = parseInt(node.getAttribute('height') || '0');
                if ((w > 0 && w < 20) || (h > 0 && h < 20)) return '';
                // Resolve relative URLs to absolute
                const absUrl = src.startsWith('http') ? src : new URL(src, window.location.href).href;
                const alt = (node.getAttribute('alt') || '').trim();
                return `\n![${alt}](${absUrl})\n`;
            }
            case 'li': return childText;
            case 'br': return '\n';
            case 'div': case 'article': case 'main': case 'section': return `${childText}\n`;
            default: return `${childText} `;
        }
    }

    // Drill into the dominant child when one child holds >85% of the text.
    // This strips layout wrappers and sidebar columns without touching real content.
    function drillDown(el) {
        const totalLen = (el.innerText || '').trim().length;
        if (totalLen === 0 || el.children.length === 0) return el;

        let bestChild = null, bestLen = 0;
        for (const child of el.children) {
            const len = (child.innerText || '').trim().length;
            if (len > bestLen) { bestLen = len; bestChild = child; }
        }

        // Only descend when one child clearly dominates (sidebar/wrapper pattern)
        if (bestChild && bestLen / totalLen > 0.85) return drillDown(bestChild);
        return el;
    }

    function findArticleNode() {
        // Try semantic selectors — pick the one with the most text content
        // (don't just return the first match; e.g. <article> can be a sidebar card)
        const candidates = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content', '.event-content', '.event-description'];
        let bestSemantic = null;
        let bestSemanticLen = 0;
        for (let selector of candidates) {
            const el = document.querySelector(selector);
            if (!el) continue;
            const len = (el.innerText || '').trim().length;
            if (len > bestSemanticLen) { bestSemanticLen = len; bestSemantic = el; }
        }
        if (bestSemantic && bestSemanticLen > 200) return drillDown(bestSemantic);

        // Fallback: score all block elements by text volume, DOM depth,
        // and a concentration penalty (avoids picking wrappers where all
        // text lives in a single child — e.g. a page-level container).
        const els = Array.from(document.querySelectorAll('div, section'));
        let bestEl = null;
        let bestScore = 0;

        for (let el of els) {
            const textLen = (el.innerText || '').trim().length;
            if (textLen < 300) continue;

            // DOM depth — prefer specific inner elements over root wrappers
            let depth = 0;
            let cursor = el.parentElement;
            while (cursor && cursor !== document.body) { depth++; cursor = cursor.parentElement; }

            // Concentration ratio: if >85% of text is in one child, it's a wrapper
            const childTexts = Array.from(el.children).map(c => (c.innerText || '').length);
            const maxChild = Math.max(0, ...childTexts);
            const concentration = textLen > 0 ? maxChild / textLen : 1;

            // Score: reward text volume and depth, penalise wrappers
            const score = textLen * (1 - 0.85 * concentration) * Math.log2(depth + 2);

            if (score > bestScore) {
                bestScore = score;
                bestEl = el;
            }
        }

        return bestEl || document.body;
    }

    function scrape() {
        const articleNode = findArticleNode();
        const { title, author } = parseMetadata();

        const metadataBlock =
`--- DOCUMENT METADATA ---
TITLE: ${cleanText(title)}
AUTHOR: ${cleanText(author)}
SOURCE: ${window.location.href}
--- END METADATA ---

`;

        let markdown = htmlToMarkdown(articleNode, true);

        // Cleanup: remove site-specific footer
        const footerIndex = markdown.indexOf("Reporting a Problem");
        if (footerIndex !== -1) markdown = markdown.substring(0, footerIndex);

        // Remove footnote references
        markdown = markdown.replace(/^\[#.*$/gm, '');

        // Collapse excessive newlines
        markdown = markdown.replace(/\n{3,}/g, '\n\n');

        // Remove duplicate title from body
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const duplicateTitleRegex = new RegExp(`^(---\\s*)?#\\s*${escapedTitle}\\s*`, 'm');
        markdown = markdown.replace(duplicateTitleRegex, '');

        const finalContent = metadataBlock + markdown.trim();

        // Filename with date prefix to prevent collisions
        const dateStr = new Date().toISOString().slice(0, 10);
        const slug = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
        const filename = `${dateStr}_${slug}.md`;

        const wordCount = finalContent.split(/\s+/).filter(w => w.length > 0).length;

        return { content: finalContent, filename, wordCount };
    }

    try {
        const result = scrape();
        window.__scraperLLMRunning = false;
        return result;
    } catch (e) {
        window.__scraperLLMRunning = false;
        return { error: e.message };
    }
})();
