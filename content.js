(async function() {
    // Re-injection guard
    if (window.__scraperLLMRunning) {
        return { error: 'Already scraping' };
    }
    window.__scraperLLMRunning = true;

    function cleanText(text) {
        return text ? text.replace(/\s+/g, ' ').trim() : "";
    }

    function normalizeText(text) {
        return cleanText(text).toLowerCase();
    }

    function isVisibleElement(node) {
        if (!node || node.nodeType !== 1) return false;
        const cs = window.getComputedStyle(node);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
    }

    function getNodeDepth(el) {
        let depth = 0;
        let cursor = el.parentElement;
        while (cursor && cursor !== document.body) {
            depth++;
            cursor = cursor.parentElement;
        }
        return depth;
    }

    function scoreNode(el) {
        const textLen = (el.innerText || '').trim().length;
        if (textLen < 50) return 0;

        const childTexts = Array.from(el.children).map(c => (c.innerText || '').trim().length);
        const maxChild = Math.max(0, ...childTexts);
        const concentration = textLen > 0 ? maxChild / textLen : 1;
        const depth = getNodeDepth(el);

        return textLen * (1 - 0.85 * concentration) * Math.log2(depth + 2);
    }

    function normalizeTitle(title) {
        let normalized = cleanText(title) || "Untitled";
        if (isRedditPage()) {
            normalized = normalized
                .replace(/\s*:\s*r\/[^|]+$/i, '')
                .replace(/\s*-\s*Reddit$/i, '')
                .replace(/\s*\|\s*Reddit$/i, '')
                .trim();
        }
        if (isLinkedInJobPage()) {
            normalized = normalized
                .replace(/\s*\|\s*LinkedIn$/i, '')
                .trim();
        }
        return normalized || "Untitled";
    }

    function isRedditPage() {
        return window.location.hostname.includes('reddit.com');
    }

    function isLinkedInJobPage() {
        return window.location.hostname.includes('linkedin.com') &&
            /^\/jobs\/view\/?/i.test(window.location.pathname);
    }

    function getRedditCommentContainerSelector() {
        return [
            'shreddit-comment',
            'faceplate-comment',
            '[data-testid="comment"]',
            '[thingid^="t1_"]'
        ].join(', ');
    }

    function getRedditCommentStart(root = document) {
        if (!isRedditPage()) return null;

        const commentContainerSelector = getRedditCommentContainerSelector();
        const selectorCandidates = [
            'textarea',
            'input[placeholder*="Search"]',
            'input[placeholder*="Search Comments"]',
            'faceplate-textarea-input',
            commentContainerSelector
        ];

        const selectorMatch = selectorCandidates
            .map(selector => queryFirstIncludingShadow(root, selector))
            .find(Boolean);
        if (selectorMatch) return selectorMatch;

        return queryAllIncludingShadow(root, 'div, span, h2, p, form, section')
            .find(el => {
                const text = normalizeText(el.innerText || el.textContent || '');
                const placeholder = normalizeText(el.getAttribute('placeholder') || '');
                return text.includes('join the conversation') ||
                    text.startsWith('sort by') ||
                    text.includes('search comments') ||
                    placeholder.includes('search comments');
            }) || null;
    }

    function getVisibleRedditCommentContainers(root = document) {
        if (!isRedditPage()) return [];
        const titleEl = document.querySelector('h1');
        const commentStart = getRedditCommentStart(root);
        const orderedElements = [];
        forEachElementIncludingShadow(root, el => {
            orderedElements.push(el);
        });
        const commentStartIndex = commentStart ? orderedElements.indexOf(commentStart) : -1;

        return queryAllIncludingShadow(root, getRedditCommentContainerSelector())
            .filter(el => isVisibleElement(el))
            .filter(el => !titleEl || !el.contains(titleEl))
            .filter(el => {
                if (commentStartIndex === -1 || el === commentStart) return true;
                return orderedElements.indexOf(el) >= commentStartIndex;
            });
    }

    function hasHydratedRedditComments(root = document) {
        return getVisibleRedditCommentContainers(root).some(container => {
            const bodyNodes = queryAllIncludingShadow(
                container,
                'p, blockquote, pre, ul, ol, [slot="comment"], [slot="comment-body"], [slot="body"], [id$="-comment-rtjson-content"]'
            );
            return bodyNodes.some(node => cleanText(node.innerText || node.textContent || '').length > 20);
        });
    }

    async function waitForCondition(predicate, timeoutMs, intervalMs = 200) {
        if (predicate()) return true;

        return await new Promise(resolve => {
            let settled = false;
            const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
            const intervalId = window.setInterval(() => {
                if (predicate()) finish(true);
            }, intervalMs);
            const observer = new MutationObserver(() => {
                if (predicate()) finish(true);
            });

            function finish(value) {
                if (settled) return;
                settled = true;
                observer.disconnect();
                window.clearTimeout(timeoutId);
                window.clearInterval(intervalId);
                resolve(value);
            }

            const observeRoot = document.documentElement || document.body;
            if (!observeRoot) {
                finish(false);
                return;
            }

            observer.observe(observeRoot, { childList: true, subtree: true, attributes: true });
        });
    }

    async function waitForRedditHydration() {
        if (!isRedditPage()) return;

        const readyStatePromise = document.readyState === 'complete'
            ? Promise.resolve()
            : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        const timeoutPromise = new Promise(resolve => window.setTimeout(resolve, 1500));
        await Promise.race([readyStatePromise, timeoutPromise]);

        if (window.customElements?.whenDefined) {
            await Promise.race([
                Promise.allSettled([
                    window.customElements.whenDefined('shreddit-post'),
                    window.customElements.whenDefined('shreddit-comment')
                ]),
                new Promise(resolve => window.setTimeout(resolve, 1500))
            ]);
        }

        const hasCommentStart = () => Boolean(getRedditCommentStart(document));
        const hasCommentBodies = () => hasHydratedRedditComments(document);

        await waitForCondition(() => hasCommentStart() || hasCommentBodies(), 2500);
        if (hasCommentStart() && !hasCommentBodies()) {
            await waitForCondition(hasCommentBodies, 2500);
        }
    }

    function getLargestVisibleElement(selectors, options = {}) {
        const { root = document, minTextLength = 1 } = options;
        let bestEl = null;
        let bestLen = 0;

        for (const selector of selectors) {
            const matches = Array.from(root.querySelectorAll(selector));
            for (const el of matches) {
                if (!isVisibleElement(el)) continue;
                const len = cleanText(el.innerText || '').length;
                if (len < minTextLength) continue;
                if (len > bestLen) {
                    bestLen = len;
                    bestEl = el;
                }
            }
        }

        return bestEl;
    }

    function getLargestVisibleText(selectors, options = {}) {
        const el = getLargestVisibleElement(selectors, options);
        return cleanText(el ? el.innerText : '');
    }

    function collectVisibleTexts(selectors, options = {}) {
        const { root = document, minTextLength = 1 } = options;
        const seen = new Set();
        const results = [];

        for (const selector of selectors) {
            const matches = Array.from(root.querySelectorAll(selector));
            for (const el of matches) {
                if (!isVisibleElement(el)) continue;
                const text = cleanText(el.innerText || '');
                if (text.length < minTextLength || seen.has(text)) continue;
                seen.add(text);
                results.push(text);
            }
        }

        return results;
    }

    function sanitizeLinkedInCompanyName(text) {
        return cleanText(text)
            .replace(/\s+\d[\d.,\s]*\s+followers?\b.*$/i, '')
            .trim();
    }

    function forEachElementIncludingShadow(root, visitor) {
        function walk(node) {
            if (!node) return;
            if (node.nodeType === 9) {
                walk(node.documentElement);
                return;
            }
            if (node.nodeType === 11) {
                Array.from(node.children || []).forEach(walk);
                return;
            }
            if (node.nodeType !== 1) return;

            visitor(node);

            if (node.shadowRoot) {
                walk(node.shadowRoot);
            }

            Array.from(node.children).forEach(walk);
        }

        walk(root);
    }

    function queryAllIncludingShadow(root, selector) {
        const matches = [];
        forEachElementIncludingShadow(root, el => {
            if (el.matches(selector)) matches.push(el);
        });
        return matches;
    }

    function queryFirstIncludingShadow(root, selector) {
        let match = null;
        forEachElementIncludingShadow(root, el => {
            if (!match && el.matches(selector)) match = el;
        });
        return match;
    }

    function closestCrossShadow(node, selector) {
        let cur = node;
        while (cur) {
            if (cur.nodeType === 1 && cur.matches(selector)) return cur;
            if (cur.parentElement) {
                cur = cur.parentElement;
                continue;
            }
            const root = cur.getRootNode ? cur.getRootNode() : null;
            cur = root && root.host ? root.host : null;
        }
        return null;
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

        if (isLinkedInJobPage()) {
            const linkedInTitle = getLargestVisibleText([
                '.job-details-jobs-unified-top-card__job-title',
                '.jobs-unified-top-card__job-title',
                'h1'
            ]);
            if (linkedInTitle) title = linkedInTitle;

            const linkedInCompany = sanitizeLinkedInCompanyName(getLargestVisibleText([
                '.job-details-jobs-unified-top-card__company-name',
                '.jobs-unified-top-card__company-name',
                'a[href*="/company/"]'
            ]));
            if (linkedInCompany) author = linkedInCompany;
        }

        return { title: normalizeTitle(title), author };
    }

    function htmlToMarkdown(node, isRoot = false, indent = 0) {
        // Text node
        if (node.nodeType === 3) {
            return node.nodeValue.replace(/\s+/g, ' ');
        }
        if (node.nodeType !== 1) return "";

        // Skip invisible elements — catches responsive duplicates (d-none, d-lg-none, etc.)
        if (!isVisibleElement(node)) return "";

        const tag = node.tagName.toLowerCase();

        if (tag === 'slot') {
            const assigned = typeof node.assignedNodes === 'function'
                ? node.assignedNodes({ flatten: true })
                : [];
            const slotChildren = assigned.length > 0 ? assigned : Array.from(node.childNodes);
            return slotChildren.map(child => htmlToMarkdown(child, false, indent)).join('');
        }

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

        let childText = "";
        if (node.shadowRoot) {
            node.shadowRoot.childNodes.forEach(child => {
                childText += htmlToMarkdown(child, false, indent);
            });
            if (!childText.trim()) {
                node.childNodes.forEach(child => {
                    childText += htmlToMarkdown(child, false, indent);
                });
            }
        } else {
            node.childNodes.forEach(child => {
                childText += htmlToMarkdown(child, false, indent);
            });
        }

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

        const remainderLen = totalLen - bestLen;

        // Only descend when one child clearly dominates and the discarded text
        // is genuinely negligible. This avoids dropping lead sections such as
        // Reddit self-post bodies that sit beside a large comments container.
        if (bestChild && bestLen / totalLen > 0.92 && remainderLen < 220) return drillDown(bestChild);
        return el;
    }

    function extractRedditLeadMarkdown() {
        if (!isRedditPage()) return '';

        const titleEl = document.querySelector('h1');
        const mainEl = queryFirstIncludingShadow(document, 'main') || document.body;
        if (!titleEl || !mainEl.contains(titleEl)) return '';

        const blockTags = new Set(['p', 'blockquote', 'pre', 'ul', 'ol', 'figure', 'img']);
        const commentStart = getRedditCommentStart(mainEl);
        const blocks = [];
        let started = false;
        const orderedElements = [];

        forEachElementIncludingShadow(mainEl, el => {
            orderedElements.push(el);
        });

        const titleIndex = orderedElements.indexOf(titleEl);
        const commentStartIndex = commentStart ? orderedElements.indexOf(commentStart) : -1;

        function hasCollectedAncestor(node) {
            return blocks.some(block => block.contains(node));
        }

        for (const node of orderedElements) {
            const nodeIndex = orderedElements.indexOf(node);
            if (nodeIndex <= titleIndex) continue;
            if (commentStartIndex !== -1 && nodeIndex >= commentStartIndex) break;
            if (!isVisibleElement(node)) continue;
            if (titleEl.contains(node) || node.contains(titleEl)) continue;

            const tag = node.tagName.toLowerCase();
            if (!blockTags.has(tag)) continue;
            if (hasCollectedAncestor(node)) continue;

            const text = cleanText(node.innerText || '');
            const isLikelyMeta = /(^\d+\s*(mo|m|h|d|w|y)\s+ago$)|(^share$)|(^reply$)|(^award$)|(^vote$)/i.test(text);
            if (tag !== 'img' && tag !== 'figure') {
                if (!started && text.length < 8) continue;
                if (isLikelyMeta) continue;
                if (started && text.length < 2) continue;
            }

            blocks.push(node);
            started = true;
        }

        return blocks
            .map(block => htmlToMarkdown(block, false).trim())
            .filter(Boolean)
            .join('\n\n')
            .trim();
    }

    function markdownIncludesSnippet(markdown, snippet) {
        const stripMarkdown = text => normalizeText(
            text
                .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
                .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
                .replace(/[`*_>#-]+/g, ' ')
        );

        const snippetText = stripMarkdown(snippet);
        const markdownText = stripMarkdown(markdown);
        if (!snippetText) return true;
        const probeBlocks = snippet
            .split(/\n{2,}/)
            .map(stripMarkdown)
            .filter(block => block.length >= 10)
            .slice(0, 4);

        if (probeBlocks.length === 0) return markdownText.includes(snippetText.slice(0, 40));

        const matches = probeBlocks.filter(block => markdownText.includes(block)).length;
        return matches >= Math.min(2, probeBlocks.length);
    }

    function extractRedditCommentsMarkdown() {
        if (!isRedditPage()) return '';
        const rootEl = document;
        const titleEl = document.querySelector('h1');
        const commentContainerSelector = getRedditCommentContainerSelector();
        const commentContainers = getVisibleRedditCommentContainers(rootEl)
            .filter(el => !titleEl || !el.contains(titleEl));

        function queryWithinComment(container, selector) {
            return queryAllIncludingShadow(container, selector)
                .filter(node => closestCrossShadow(node, commentContainerSelector) === container);
        }

        function filterOutNestedNodes(nodes) {
            return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
        }

        return commentContainers
            .map(container => {
                const authorCandidates = queryWithinComment(
                    container,
                    'a[href*="/user/"], a[href*="/u/"], [data-testid="comment_author_link"], [slot*="author"]'
                );
                const authorEl = authorCandidates.find(el => cleanText(el.textContent || '').length > 0);
                const attrUser = cleanText(
                    container.getAttribute('author') ||
                    container.getAttribute('data-author') ||
                    container.dataset?.author ||
                    ''
                );
                const user = cleanText(authorEl ? authorEl.textContent : attrUser);
                if (!user || /^(automoderator|\[deleted]|deleted|\[removed]|removed)$/i.test(user)) return null;

                const bodyNodes = filterOutNestedNodes(queryWithinComment(
                    container,
                    'p, blockquote, pre, ul, ol, figure, img, [slot="comment"], [slot="comment-body"], [slot="body"], [id$="-comment-rtjson-content"]'
                ));
                const body = bodyNodes
                    .map(node => htmlToMarkdown(node, false).trim())
                    .filter(Boolean)
                    .join('\n\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                if (!body || /i am a bot, and this action was performed automatically/i.test(body)) return null;
                return { user, body };
            })
            .filter(Boolean)
            .map(comment => `---\n\n## ${comment.user}\n\n${comment.body}`)
            .join('\n\n')
            .trim();
    }

    function extractRedditCommentsFromMarkdown(fullMarkdown) {
        if (!isRedditPage() || !fullMarkdown) return '';

        const markerCandidates = ['Join the conversation', 'Sort by:', 'Open comment sort options'];
        const markerIndex = markerCandidates
            .map(marker => fullMarkdown.indexOf(marker))
            .filter(index => index !== -1)
            .sort((a, b) => a - b)[0];

        if (markerIndex === undefined) return '';

        const comments = [];
        const lines = fullMarkdown.slice(markerIndex).split('\n');
        let currentUser = '';
        let bodyLines = [];

        function flushCurrent() {
            if (!currentUser) return;

            const body = bodyLines
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            const isNoiseUser = /^(automoderator|\[deleted]|deleted|\[removed]|removed)$/i.test(currentUser);
            const isBotBody = /i am a bot, and this action was performed automatically/i.test(body);
            if (!isNoiseUser && !isBotBody && body) {
                comments.push({ user: currentUser, body });
            }

            currentUser = '';
            bodyLines = [];
        }

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                if (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] !== '') bodyLines.push('');
                continue;
            }

            if (line.includes('Join the conversation') || line.startsWith('Sort by:') || line.includes('Open comment sort options')) continue;
            if (line.startsWith('[More replies]')) {
                flushCurrent();
                continue;
            }
            if (line.startsWith('[![') || /avatar/i.test(line)) continue;
            if (/^(share|reply|award|vote)$/i.test(line)) continue;
            if (/^\d+\s+(share|reply|award|vote)\b/i.test(line)) continue;

            const userMatch = line.match(/^\[([^\]]+)\]\((?:https?:\/\/(?:www\.)?reddit\.com)?\/user\/[^)]+\)\s*(.*)$/);
            if (userMatch) {
                flushCurrent();
                currentUser = cleanText(userMatch[1]);
                const inlineBody = cleanText(userMatch[2] || '');
                if (inlineBody) bodyLines.push(inlineBody);
                continue;
            }

            if (!currentUser) continue;
            if (/^•\s*\[[^\]]+\]\(\/r\/.*\/comment\//.test(line)) continue;
            if (/^•\s*edited\b/i.test(line)) continue;

            bodyLines.push(line);
        }

        flushCurrent();

        return comments
            .map(comment => `---\n\n## ${comment.user}\n\n${comment.body}`)
            .join('\n\n')
            .trim();
    }

    function buildRedditMarkdown(fullMarkdown) {
        const redditLead = extractRedditLeadMarkdown();
        const redditComments = extractRedditCommentsMarkdown() || extractRedditCommentsFromMarkdown(fullMarkdown);

        if (redditLead || redditComments) {
            return [redditLead, redditComments].filter(Boolean).join('\n\n').trim();
        }

        return fullMarkdown;
    }

    function normalizeLinkedInHeaderSegments(text) {
        return cleanText(text)
            .split(/\s*[·•]\s*/)
            .map(segment => cleanText(segment))
            .filter(Boolean)
            .filter(segment => {
                return !(
                    /people clicked apply/i.test(segment) ||
                    /^promoted\b/i.test(segment) ||
                    /responses managed off linkedin/i.test(segment) ||
                    /see how you compare/i.test(segment) ||
                    /exclusive applicant insights/i.test(segment) ||
                    /try premium/i.test(segment)
                );
            });
    }

    function cleanLinkedInMarkdown(markdown) {
        if (!markdown) return '';

        const stopMarkers = [
            '\n## Set alert for similar jobs',
            '\n## More jobs',
            '\n## Meet the hiring team',
            '\n## People also viewed',
            '\n## Similar searches',
            '\n## Explore collaborative articles',
            '\n## Discover more from LinkedIn'
        ];

        let trimmed = markdown;
        for (const marker of stopMarkers) {
            const index = trimmed.indexOf(marker);
            if (index !== -1) {
                trimmed = trimmed.substring(0, index);
            }
        }

        const aboutMatches = Array.from(trimmed.matchAll(/(^|\n)##\s+About the job\b/gi));
        const aboutMatch = aboutMatches.length > 0 ? aboutMatches[aboutMatches.length - 1] : null;
        if (aboutMatch && typeof aboutMatch.index === 'number') {
            const headingIndex = aboutMatch.index + (aboutMatch[1] ? aboutMatch[1].length : 0);
            if (headingIndex > 0) {
                trimmed = trimmed.substring(headingIndex);
            }
        }

        trimmed = trimmed
            .split('\n')
            .filter(line => {
                const normalized = normalizeText(line);
                if (!normalized) return true;

                return !(
                    normalized.includes('try premium') ||
                    normalized.includes('exclusive applicant insights') ||
                    normalized.includes('set alert for similar jobs') ||
                    normalized.includes('job search faster with premium') ||
                    normalized.includes('more jobs') ||
                    normalized.includes('see how you compare') ||
                    normalized.includes('people clicked apply') ||
                    normalized.includes('promoted by hirer') ||
                    normalized.includes('responses managed off linkedin') ||
                    normalized.includes('company logo for') ||
                    /^#+\s*\d+\s+notifications?$/.test(normalized) ||
                    /^\d+\s+notifications?$/.test(normalized) ||
                    /^\[apply\]\(https?:\/\/www\.linkedin\.com\/redir\/redirect/i.test(line.trim()) ||
                    /linkedin\.com\/jobs\/view\//i.test(line) ||
                    /linkedin\.com\/company\//i.test(line)
                );
            })
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return trimmed;
    }

    function findLinkedInDescriptionNode() {
        return getLargestVisibleElement([
            '.jobs-description__container .jobs-box__html-content',
            '.jobs-description__container .jobs-description-content__text',
            '.jobs-description-content__text',
            '.jobs-box__html-content',
            '.jobs-description__content',
            '.jobs-description-content',
            '.jobs-description'
        ], { minTextLength: 300 });
    }

    function buildLinkedInMarkdown(fallbackMarkdown = '') {
        const company = sanitizeLinkedInCompanyName(getLargestVisibleText([
            '.job-details-jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__company-name',
            'a[href*="/company/"]'
        ]));
        const primaryHeader = getLargestVisibleText([
            '.job-details-jobs-unified-top-card__primary-description-container',
            '.jobs-unified-top-card__primary-description',
            '.jobs-unified-top-card__subtitle-primary-grouping'
        ]);
        const insightTexts = collectVisibleTexts([
            '.job-details-jobs-unified-top-card__job-insight',
            '.job-details-jobs-unified-top-card__job-insight-view-model-secondary',
            '.job-details-preferences-and-skills__pill'
        ], { minTextLength: 3 })
            .flatMap(normalizeLinkedInHeaderSegments);

        const headerLines = [];
        if (company) headerLines.push(company);
        headerLines.push(...normalizeLinkedInHeaderSegments(primaryHeader));
        for (const insight of insightTexts) {
            if (!headerLines.includes(insight)) {
                headerLines.push(insight);
            }
        }

        const descriptionNode = findLinkedInDescriptionNode();
        const rawDescription = descriptionNode
            ? htmlToMarkdown(descriptionNode, true).trim()
            : fallbackMarkdown;
        const cleanedDescription = cleanLinkedInMarkdown(rawDescription);

        const sections = [];
        if (headerLines.length > 0) {
            sections.push(headerLines.join('\n\n'));
        }
        if (cleanedDescription) {
            if (/^##\s+about the job\b/i.test(cleanedDescription)) {
                sections.push(cleanedDescription);
            } else {
                sections.push(`---\n\n## About the job\n\n${cleanedDescription}`);
            }
        }

        return sections.join('\n\n').trim();
    }

    function findArticleNode() {
        if (isRedditPage()) {
            return document.body;
        }
        if (isLinkedInJobPage()) {
            return findLinkedInDescriptionNode() || document.body;
        }

        // Try semantic selectors — pick the one with the most text content
        // (don't just return the first match; e.g. <article> can be a sidebar card)
        const candidates = [
            'article',
            'main',
            '[role="main"]',
            '.post-content',
            '.article-body',
            '.entry-content',
            '.event-content',
            '.event-description'
        ];
        let bestSemantic = null;
        let bestSemanticScore = 0;
        for (let selector of candidates) {
            const els = Array.from(document.querySelectorAll(selector));
            for (const el of els) {
                const len = (el.innerText || '').trim().length;
                if (len < 200) continue;
                const score = scoreNode(el);
                if (score > bestSemanticScore) {
                    bestSemanticScore = score;
                    bestSemantic = el;
                }
            }
        }
        if (bestSemantic) return drillDown(bestSemantic);

        // Fallback: score all block elements by text volume, DOM depth,
        // and a concentration penalty (avoids picking wrappers where all
        // text lives in a single child — e.g. a page-level container).
        const els = Array.from(document.querySelectorAll('div, section'));
        let bestEl = null;
        let bestScore = 0;

        for (let el of els) {
            const textLen = (el.innerText || '').trim().length;
            if (textLen < 300) continue;
            const score = scoreNode(el);

            if (score > bestScore) {
                bestScore = score;
                bestEl = el;
            }
        }

        return bestEl || document.body;
    }

    async function scrape() {
        if (isRedditPage()) {
            await waitForRedditHydration();
        }

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
        if (isRedditPage()) {
            markdown = buildRedditMarkdown(markdown);
        } else if (isLinkedInJobPage()) {
            markdown = buildLinkedInMarkdown(markdown);
        } else {
            const redditLead = extractRedditLeadMarkdown();
            if (redditLead && !markdownIncludesSnippet(markdown, redditLead)) {
                markdown = `${redditLead}\n\n${markdown.trim()}`;
            }
        }

        // Cleanup: remove site-specific footer
        const footerIndex = markdown.indexOf("Reporting a Problem");
        if (footerIndex !== -1) markdown = markdown.substring(0, footerIndex);

        if (isRedditPage()) {
            markdown = markdown
                .replace(/^\s*Join the conversation\s*$/gmi, '')
                .replace(/^\s*Sort by:\s*.*$/gmi, '')
                .replace(/^\s*Search Comments\s*$/gmi, '');
        }
        if (isLinkedInJobPage()) {
            markdown = cleanLinkedInMarkdown(markdown);
        }

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
        const slug = title
            .replace(/[^\p{L}\p{N}]+/gu, '_')  // keep Unicode letters & numbers (Cyrillic, Latin, etc.)
            .toLowerCase()
            .replace(/^_+|_+$/g, '')            // trim leading/trailing underscores
            .substring(0, 60);
        const filename = `${dateStr}_${slug}.md`;

        const wordCount = finalContent.split(/\s+/).filter(w => w.length > 0).length;

        return { content: finalContent, filename, wordCount };
    }

    try {
        const result = await scrape();
        window.__scraperLLMRunning = false;
        return result;
    } catch (e) {
        window.__scraperLLMRunning = false;
        return { error: e.message };
    }
})();
