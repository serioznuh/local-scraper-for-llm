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

    function normalizeInjectedBoolean(value) {
        return value === true || value === 1;
    }

    function normalizeInjectedInteger(value, fallback) {
        if (typeof value === 'string' && !value.trim()) return fallback;
        if (typeof value !== 'number' && typeof value !== 'string') return fallback;
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.trunc(number);
    }

    function getScraperSettings() {
        const source = window.__scraperSettings && typeof window.__scraperSettings === 'object'
            ? window.__scraperSettings
            : {};
        return {
            redditCommentScoreFilterEnabled: normalizeInjectedBoolean(source.redditCommentScoreFilterEnabled),
            redditCommentMinScore: normalizeInjectedInteger(source.redditCommentMinScore, 2),
            redditTrivialCommentFilterEnabled: normalizeInjectedBoolean(source.redditTrivialCommentFilterEnabled)
        };
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

    function queryRedditCommentContainers(root = document) {
        const selector = getRedditCommentContainerSelector();
        const seen = new Set();
        const matches = [];

        function addMatch(el) {
            if (!el || seen.has(el)) return;
            seen.add(el);
            matches.push(el);
        }

        if (root.querySelectorAll) {
            Array.from(root.querySelectorAll(selector)).forEach(addMatch);
        }
        queryAllIncludingShadow(root, selector).forEach(addMatch);

        return matches;
    }

    function getRedditCurrentPostContainer(titleEl, root = document) {
        if (!isRedditPage() || !titleEl) return null;

        return queryAllIncludingShadow(
            root,
            'shreddit-post, [slot="post"], article, [data-testid="post-container"]'
        ).find(el => el.contains(titleEl)) || null;
    }

    function isRedditAvatarImage(node, src = '', alt = '') {
        if (!node) return false;
        const normalizedAlt = normalizeText(alt || node.getAttribute('alt') || '');
        const normalizedSrc = (src || node.getAttribute('src') || '').toLowerCase();

        return (normalizedAlt.startsWith('u/') && normalizedAlt.includes('avatar')) ||
            normalizedSrc.includes('/avatars/') ||
            normalizedSrc.includes('profileicon');
    }

    function getTimestampTextFromElement(el) {
        if (!el) return '';
        return formatDateOnlyTimestamp(
            el.getAttribute('datetime') ||
            el.getAttribute('title') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('created-timestamp') ||
            el.getAttribute('created') ||
            el.getAttribute('data-created-utc') ||
            el.innerText ||
            el.textContent ||
            ''
        );
    }

    function formatDateOnlyTimestamp(value) {
        const text = cleanText(value);
        if (!text) return '';

        const isoDateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (isoDateMatch) return isoDateMatch[1];

        if (/^\d{10}(?:\.\d+)?$/.test(text)) {
            const parsed = new Date(Number(text) * 1000);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        }

        if (/^\d{13}$/.test(text)) {
            const parsed = new Date(Number(text));
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        }

        if (/\b\d{4}\b/.test(text)) {
            const parsed = new Date(text);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        }

        return text;
    }

    function firstDateOnlyTimestamp(...values) {
        return values.map(formatDateOnlyTimestamp).find(Boolean) || '';
    }

    function formatScrapedAtTimestamp(date) {
        const parsed = date instanceof Date ? date : new Date(date);
        const value = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
        const pad = part => String(part).padStart(2, '0');
        return [
            value.getUTCFullYear(),
            pad(value.getUTCMonth() + 1),
            pad(value.getUTCDate())
        ].join('-') + ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())} UTC`;
    }

    function isDateOnlyTimestamp(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    function parseRedditInteger(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return null;
        const normalized = String(value).trim().replace(/,/g, '');
        if (!/^[+-]?\d+$/.test(normalized)) return null;
        const parsed = Number.parseInt(normalized, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function formatRedditScore(score) {
        if (typeof score !== 'number') return '';
        return score > 0 ? `+${score}` : `${score}`;
    }

    function getRedditSubreddit() {
        if (!isRedditPage()) return '';
        const match = (window.location.pathname || '').match(/\/r\/([^/?#]+)/i);
        return match ? `r/${decodeURIComponent(match[1])}` : '';
    }

    function getRedditIntegerAttribute(el, names) {
        if (!el) return null;
        for (const name of names) {
            const parsed = parseRedditInteger(el.getAttribute(name));
            if (parsed !== null) return parsed;
        }
        return null;
    }

    function getRedditCurrentPost() {
        const titleEl = document.querySelector('h1');
        return getRedditCurrentPostContainer(titleEl) || null;
    }

    function getRedditPostScore() {
        const post = getRedditCurrentPost();
        const attrScore = getRedditIntegerAttribute(post, [
            'score',
            'post-score',
            'data-score',
            'data-post-score',
            'upvote-count',
            'data-upvote-count'
        ]);
        if (attrScore !== null) return attrScore;

        const actionRow = post
            ? queryAllIncludingShadow(post, '[score], [data-score], shreddit-post-action-row')
                .find(el => !closestCrossShadow(el, getRedditCommentContainerSelector()) &&
                    getRedditIntegerAttribute(el, ['score', 'data-score']) !== null)
            : null;
        return getRedditIntegerAttribute(actionRow, ['score', 'data-score']);
    }

    function getRedditDisplayedCommentCount() {
        const post = getRedditCurrentPost();
        const attrCount = getRedditIntegerAttribute(post, [
            'comment-count',
            'comments-count',
            'commentcount',
            'data-comment-count',
            'data-comments-count'
        ]);
        if (attrCount !== null) return attrCount;

        const countEl = queryAllIncludingShadow(post || document, '[comment-count], [data-comment-count], [aria-label*="comments"]')
            .find(el => {
                return getRedditIntegerAttribute(el, ['comment-count', 'data-comment-count']) !== null ||
                    /\b\d[\d,]*\s+comments?\b/i.test(el.getAttribute('aria-label') || el.innerText || '');
            });
        const nestedAttrCount = getRedditIntegerAttribute(countEl, ['comment-count', 'data-comment-count']);
        if (nestedAttrCount !== null) return nestedAttrCount;

        const textMatch = cleanText(countEl?.getAttribute('aria-label') || countEl?.innerText || '')
            .match(/\b(\d[\d,]*)\s+comments?\b/i);
        return textMatch ? parseRedditInteger(textMatch[1]) : null;
    }

    const INVALID_AUTOLINK_TLDS = new Set([
        'bash',
        'c',
        'cfg',
        'cpp',
        'cs',
        'css',
        'csv',
        'go',
        'h',
        'hpp',
        'html',
        'ini',
        'java',
        'js',
        'json',
        'jsx',
        'kt',
        'md',
        'php',
        'py',
        'rb',
        'rs',
        'sh',
        'sql',
        'swift',
        'toml',
        'ts',
        'tsx',
        'txt',
        'xml',
        'yaml',
        'yml',
        'zsh'
    ]);

    function parseHttpUrl(value) {
        try {
            const url = new URL(value, window.location.href);
            return /^https?:$/i.test(url.protocol) ? url : null;
        } catch (e) {
            return null;
        }
    }

    function getPublicTld(hostname) {
        const normalized = cleanText(hostname || '').toLowerCase().replace(/\.$/, '');
        if (!normalized || normalized === 'localhost' || !normalized.includes('.')) return '';
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return '';
        const labels = normalized.split('.').filter(Boolean);
        return labels.length > 1 ? labels[labels.length - 1] : '';
    }

    function hasValidPublicTld(hostname) {
        const tld = getPublicTld(hostname);
        return /^[a-z]{2,63}$/i.test(tld) && !INVALID_AUTOLINK_TLDS.has(tld);
    }

    function normalizeUrlComparable(value) {
        return cleanText(value)
            .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/\/$/, '')
            .toLowerCase();
    }

    function isUrlLikeLabel(label) {
        return /^[a-z][a-z0-9+.-]*:\/\//i.test(label) ||
            /^[^\s/]+\.[a-z0-9-]{2,}(?:[/?#:]|$)/i.test(label);
    }

    function shouldSuppressPlainTextAutoLink(href, label) {
        const url = parseHttpUrl(href);
        if (!url) return false;

        const text = cleanText(label);
        if (!text || /\s/.test(text) || !isUrlLikeLabel(text)) return false;

        const urlText = `${url.hostname}${url.pathname}${url.search}${url.hash}`;
        const textMatchesUrl = normalizeUrlComparable(text) === normalizeUrlComparable(urlText);
        if (!textMatchesUrl) return false;

        const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
        return !hasExplicitScheme || !hasValidPublicTld(url.hostname);
    }

    function normalizeMarkdownHref(href) {
        try {
            return new URL(href, window.location.href).href;
        } catch (e) {
            return href;
        }
    }

    function getPublishedTimestamp() {
        if (isRedditPage()) {
            const redditTimestamp = getRedditPostTimestamp();
            if (redditTimestamp) return redditTimestamp;
        }

        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    const value = item.datePublished || item.dateCreated || item.uploadDate;
                    const timestamp = formatDateOnlyTimestamp(value);
                    if (timestamp) return timestamp;
                }
            } catch (e) {}
        }

        const meta = document.querySelector(
            'meta[property="article:published_time"], meta[name="article:published_time"], meta[name="date"], meta[name="pubdate"], meta[itemprop="datePublished"]'
        );
        return formatDateOnlyTimestamp(meta ? meta.content : '');
    }

    function getRedditPostTimestamp() {
        if (!isRedditPage()) return '';

        const titleEl = document.querySelector('h1');
        const mainEl = queryFirstIncludingShadow(document, 'main') || document.body;
        const commentStart = getRedditCommentStart(mainEl);
        const commentContainerSelector = getRedditCommentContainerSelector();

        const postContainers = queryAllIncludingShadow(
            document,
            'shreddit-post, [slot="post"], article, [data-testid="post-container"]'
        ).filter(el => !titleEl || el.contains(titleEl));

        for (const container of postContainers) {
            const attrTimestamp = firstDateOnlyTimestamp(
                container.getAttribute('created-timestamp'),
                container.getAttribute('created'),
                container.getAttribute('data-created-utc'),
                container.dataset?.createdUtc,
                container.getAttribute('date'),
                container.getAttribute('timestamp')
            );
            if (attrTimestamp) return attrTimestamp;

            const timeEl = queryAllIncludingShadow(
                container,
                'time[datetime], time, faceplate-timeago, [datetime]'
            ).find(el => !closestCrossShadow(el, commentContainerSelector) && getTimestampTextFromElement(el));
            const timestamp = getTimestampTextFromElement(timeEl);
            if (timestamp) return timestamp;
        }

        const orderedElements = [];

        forEachElementIncludingShadow(mainEl, el => {
            orderedElements.push(el);
        });

        const commentStartIndex = commentStart ? orderedElements.indexOf(commentStart) : -1;
        const timeCandidates = queryAllIncludingShadow(mainEl, 'time[datetime], time, faceplate-timeago, [datetime]');

        for (const el of timeCandidates) {
            const index = orderedElements.indexOf(el);
            if (index === -1) continue;
            if (commentStartIndex !== -1 && index >= commentStartIndex) continue;
            if (closestCrossShadow(el, commentContainerSelector)) continue;

            const timestamp = getTimestampTextFromElement(el);
            if (timestamp) return timestamp;
        }

        return '';
    }

    function cleanRedditAuthor(text) {
        let author = cleanText(text);
        if (!author) return '';
        author = author.split(/[·•]/)[0].trim();
        author = author.replace(/\s+\b(OP|MOD)\b.*$/i, '').trim();
        return author;
    }

    function getRedditPostAuthor() {
        if (!isRedditPage()) return '';

        const titleEl = document.querySelector('h1');
        const mainEl = queryFirstIncludingShadow(document, 'main') || document.body || document;
        const currentPost = getRedditCurrentPostContainer(titleEl, mainEl);
        const post = currentPost || queryAllIncludingShadow(
            document,
            'shreddit-post[author], [data-testid="post-container"], article'
        ).find(el => !titleEl || el.contains(titleEl));
        if (!post) return '';

        const attrAuthor = cleanRedditAuthor(
            post.getAttribute('author') ||
            post.getAttribute('data-author') ||
            post.dataset?.author ||
            ''
        );
        if (attrAuthor) return attrAuthor;

        const authorEl = queryAllIncludingShadow(
            post,
            'a[href*="/user/"], a[href*="/u/"], [data-testid*="post_author"], [slot*="author"]'
        ).find(el => cleanRedditAuthor(el.textContent || '').length > 0);

        return cleanRedditAuthor(authorEl ? authorEl.textContent : '');
    }

    function getRedditCommentId(container) {
        return cleanText(
            container.id ||
            container.getAttribute('thingid') ||
            container.getAttribute('data-thingid') ||
            container.getAttribute('fullname') ||
            container.getAttribute('data-fullname') ||
            container.getAttribute('comment-id') ||
            container.getAttribute('data-comment-id') ||
            ''
        );
    }

    function getRedditCommentParentId(container) {
        return cleanText(
            container.getAttribute('parentid') ||
            container.getAttribute('parent-id') ||
            container.getAttribute('data-parentid') ||
            container.getAttribute('data-parent-id') ||
            ''
        );
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
            .find(el => el && isVisibleElement(el));
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

        const candidates = queryRedditCommentContainers(root)
            .filter(el => isVisibleElement(el) || cleanText(el.innerText || el.textContent || '').length > 20)
            .filter(el => !titleEl || !el.contains(titleEl));
        const afterCommentStart = candidates.filter(el => {
            if (commentStartIndex === -1 || el === commentStart) return true;
            const elementIndex = orderedElements.indexOf(el);
            return elementIndex === -1 || elementIndex >= commentStartIndex;
        });

        return afterCommentStart.length > 0 ? afterCommentStart : candidates;
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

    function getRedditCommentLoadSignature() {
        return getVisibleRedditCommentContainers(document)
            .map(container => {
                return getRedditCommentId(container) ||
                    `${cleanRedditAuthor(container.getAttribute('author') || '')}:${cleanText(container.innerText || container.textContent || '').slice(0, 80)}`;
            })
            .filter(Boolean)
            .join('|');
    }

    function promptRedditCommentLoading(options = {}) {
        if (!isRedditPage()) return;

        const { fromLastComment = false } = options;
        const visibleComments = getVisibleRedditCommentContainers(document);
        const lastComment = visibleComments[visibleComments.length - 1] || null;
        const commentStart = getRedditCommentStart(document);
        const commentTree = queryFirstIncludingShadow(
            document,
            'shreddit-comment-tree, [data-testid="comment-tree"], [slot="comments"]'
        );
        const firstComment = queryFirstIncludingShadow(document, getRedditCommentContainerSelector());
        const targets = fromLastComment && lastComment
            ? [lastComment]
            : [commentStart, commentTree, firstComment].filter(Boolean);

        for (const target of targets) {
            if (typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ block: 'center', inline: 'nearest' });
                break;
            }
        }

        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
        const scrollDistance = Math.max(Math.round(viewportHeight * 1.5), 1200);
        if (typeof window.scrollBy === 'function') {
            try {
                window.scrollBy({ top: scrollDistance, left: 0, behavior: 'instant' });
            } catch (e) {
                window.scrollBy(0, scrollDistance);
            }
        }
    }

    async function promptRedditLazyTailCommentLoading() {
        if (!isRedditPage() || !hasHydratedRedditComments(document)) return;

        let previousSignature = getRedditCommentLoadSignature();
        if (!previousSignature) return;

        for (let pass = 0; pass < 6; pass++) {
            promptRedditCommentLoading({ fromLastComment: true });
            const changed = await waitForCondition(
                () => getRedditCommentLoadSignature() !== previousSignature,
                1200,
                250
            );
            const nextSignature = getRedditCommentLoadSignature();
            if (!changed || nextSignature === previousSignature) break;
            previousSignature = nextSignature;
        }
    }

    function getRedditMoreReplyControls() {
        const commentContainerSelector = getRedditCommentContainerSelector();
        const moreReplyPattern = /^(?:view\s+)?(?:\d+\s+)?more\s+repl(?:y|ies)$/i;
        const seen = new Set();

        return queryAllIncludingShadow(document, 'button, [role="button"]')
            .filter(el => {
                if (!closestCrossShadow(el, commentContainerSelector)) return false;
                const text = cleanText(
                    el.innerText ||
                    el.textContent ||
                    el.getAttribute('aria-label') ||
                    ''
                );
                if (!moreReplyPattern.test(text)) return false;
                if (!isVisibleElement(el)) return false;
                if (typeof el.getBoundingClientRect === 'function') {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) return false;
                }
                if (seen.has(el)) return false;
                seen.add(el);
                return typeof el.click === 'function';
            });
    }

    async function expandRedditMoreReplies() {
        if (!isRedditPage() || !hasHydratedRedditComments(document)) return;

        let clicksRemaining = 40;
        let previousSignature = getRedditCommentLoadSignature();
        const clickedControls = new WeakSet();

        for (let pass = 0; pass < 6 && clicksRemaining > 0; pass++) {
            const controls = getRedditMoreReplyControls()
                .filter(control => !clickedControls.has(control))
                .slice(0, Math.min(8, clicksRemaining));
            if (controls.length === 0) break;

            for (const control of controls) {
                try {
                    clickedControls.add(control);
                    if (typeof control.scrollIntoView === 'function') {
                        control.scrollIntoView({ block: 'center', inline: 'nearest' });
                    }
                    control.click();
                    clicksRemaining--;
                } catch (e) {}
            }

            await waitForCondition(
                () => getRedditCommentLoadSignature() !== previousSignature,
                2500,
                200
            );
            const nextSignature = getRedditCommentLoadSignature();
            const unclickedControls = getRedditMoreReplyControls()
                .filter(control => !clickedControls.has(control));
            if (nextSignature === previousSignature && unclickedControls.length === 0) break;
            previousSignature = nextSignature;
        }
    }

    async function waitForRedditHydration() {
        if (!isRedditPage()) return;

        const originalScrollX = window.scrollX || 0;
        const originalScrollY = window.scrollY || 0;
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

        await waitForCondition(() => hasCommentStart() || hasCommentBodies(), 3500);
        if (!hasCommentBodies()) {
            promptRedditCommentLoading();
            await waitForCondition(hasCommentBodies, 7000, 250);
        }
        if (!hasCommentBodies()) {
            promptRedditCommentLoading();
            await waitForCondition(hasCommentBodies, 3500, 250);
        }
        await promptRedditLazyTailCommentLoading();
        await expandRedditMoreReplies();
        await promptRedditLazyTailCommentLoading();

        return () => {
            if (typeof window.scrollTo === 'function') {
                window.setTimeout(() => window.scrollTo(originalScrollX, originalScrollY), 0);
            }
        };
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
                if (shouldSuppressPlainTextAutoLink(href, childText)) return childText.trim();
                return `[${childText.trim()}](${normalizeMarkdownHref(href)})`;

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
                const alt = (node.getAttribute('alt') || '').trim();
                if (!src || src.startsWith('data:')) return ''; // skip inline blobs & tracking pixels
                if (isRedditPage() && isRedditAvatarImage(node, src, alt)) return '';
                // Skip tiny images (icons, spacers, tracking pixels <= 20 px)
                const w = parseInt(node.getAttribute('width') || '0');
                const h = parseInt(node.getAttribute('height') || '0');
                if ((w > 0 && w < 20) || (h > 0 && h < 20)) return '';
                // Resolve relative URLs to absolute
                const absUrl = src.startsWith('http') ? src : new URL(src, window.location.href).href;
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
        const leadRoot = getRedditCurrentPostContainer(titleEl, mainEl) || mainEl;
        const commentStart = getRedditCommentStart(leadRoot);
        const blocks = [];
        let started = false;
        const orderedElements = [];

        forEachElementIncludingShadow(leadRoot, el => {
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

    function extractRedditCommentsMarkdown(scraperSettings = getScraperSettings()) {
        if (!isRedditPage()) return '';
        const rootEl = document;
        const titleEl = document.querySelector('h1');
        const commentContainerSelector = getRedditCommentContainerSelector();
        const commentContainers = getVisibleRedditCommentContainers(rootEl)
            .filter(el => !titleEl || !el.contains(titleEl));
        const scoreFilterEnabled = scraperSettings.redditCommentScoreFilterEnabled === true;
        const trivialFilterEnabled = scraperSettings.redditTrivialCommentFilterEnabled === true;
        const minScore = scraperSettings.redditCommentMinScore;
        const postTimestamp = getRedditPostTimestamp();
        const postAuthor = getRedditPostAuthor();

        function queryWithinComment(container, selector) {
            return queryAllIncludingShadow(container, selector)
                .filter(node => closestCrossShadow(node, commentContainerSelector) === container);
        }

        function filterOutNestedNodes(nodes) {
            return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
        }

        function parseScore(value) {
            return parseRedditInteger(value);
        }

        function extractCommentScore(container) {
            const attrScore = parseScore(container.getAttribute('score'));
            if (attrScore !== null) return attrScore;

            const actionRow = queryWithinComment(container, 'shreddit-comment-action-row[score]')
                .find(el => parseScore(el.getAttribute('score')) !== null);
            return actionRow ? parseScore(actionRow.getAttribute('score')) : null;
        }

        function hasOpMarkerText(text) {
            return /(?:^|[\s·•])OP(?:$|[\s·•])/i.test(cleanText(text));
        }

        function isTruthyFlag(value) {
            return /^(true|1|yes)$/i.test(cleanText(value || ''));
        }

        function hasOpAttribute(el) {
            if (!el) return false;
            if ([
                'is-op',
                'op',
                'data-is-op',
                'data-op',
                'author-is-op',
                'data-author-is-op'
            ].some(name => isTruthyFlag(el.getAttribute(name)))) {
                return true;
            }

            return [
                'author-distinguished',
                'data-author-distinguished',
                'distinguished',
                'data-distinguished'
            ].some(name => {
                const value = cleanText(el.getAttribute(name) || '');
                return /^(op|true|1|yes)$/i.test(value);
            });
        }

        function extractCommentOpFlag(container, rawAuthorText, bodyNodes = []) {
            if (hasOpAttribute(container)) return true;
            if (hasOpMarkerText(rawAuthorText)) return true;

            return queryWithinComment(
                container,
                'span, [aria-label*="OP"], [aria-label*="Original Poster"], [data-testid*="op"], [slot*="author-flair"], [is-op], [data-is-op], [author-distinguished], [data-author-distinguished]'
            ).some(el => !bodyNodes.some(bodyNode => bodyNode.contains(el)) &&
                (hasOpAttribute(el) ||
                hasOpMarkerText(el.textContent || el.getAttribute('aria-label') || '')));
        }

        function getDeletedCommentMarker(user, body) {
            const normalizedBody = normalizeText(body).replace(/[.!]+$/, '');
            if (/^\[removed]$/i.test(body)) return '[removed-by-mod]';
            if (/^(?:comment\s+)?removed\s+by\s+moderator$/i.test(normalizedBody)) return '[removed-by-mod]';
            if (/^\[deleted]$/i.test(body)) return '[deleted-by-user]';
            if (/^(?:comment\s+)?deleted\s+by\s+user$/i.test(normalizedBody)) return '[deleted-by-user]';
            if (!body && /^\[deleted]$/i.test(user)) return '[deleted-by-user]';
            return '';
        }

        function extractCommentTimestamp(container) {
            const attrTimestamp = firstDateOnlyTimestamp(
                container.getAttribute('created-timestamp') ||
                container.getAttribute('created') ||
                container.getAttribute('data-created-utc') ||
                container.dataset?.createdUtc ||
                ''
            );
            if (attrTimestamp) return attrTimestamp;

            const timeEl = queryWithinComment(
                container,
                'time[datetime], time, faceplate-timeago, [datetime]'
            ).find(el => getTimestampTextFromElement(el));
            const timestamp = getTimestampTextFromElement(timeEl);
            if (timestamp) return timestamp;

            const headerLines = (container.innerText || '')
                .split(/\n+/)
                .map(line => cleanText(line))
                .filter(Boolean)
                .slice(0, 8);
            const relativeTimestamp = headerLines.find(line => /^(?:edited\s+)?(?:\d+\s*(?:m|h|d|w|mo|y)\s+ago|just now|today|yesterday)$/i.test(line));
            return formatDateOnlyTimestamp(relativeTimestamp || '');
        }

        function extractOwnCommentBodyNodes(container) {
            const id = getRedditCommentId(container);
            const expectedBodyId = id ? `${id}-comment-rtjson-content` : '';
            const bodyCandidates = queryAllIncludingShadow(
                container,
                'p, blockquote, pre, ul, ol, figure, img, [slot="comment"], [slot="comment-body"], [slot="body"], [id$="-comment-rtjson-content"]'
            );
            const exactBodyNode = expectedBodyId
                ? bodyCandidates.find(node => node.id === expectedBodyId)
                : null;
            if (exactBodyNode) return [exactBodyNode];

            return filterOutNestedNodes(bodyCandidates)
                .filter(node => closestCrossShadow(node, commentContainerSelector) === container);
        }

        function extractComment(container) {
            const authorCandidates = queryWithinComment(
                container,
                'a[href*="/user/"], a[href*="/u/"], [data-testid="comment_author_link"], [slot*="author"]'
            );
            const authorEl = authorCandidates.find(el => cleanText(el.textContent || '').length > 0);
            const rawAttrUser = (
                container.getAttribute('author') ||
                container.getAttribute('data-author') ||
                container.dataset?.author ||
                ''
            );
            const rawAuthorText = rawAttrUser || (authorEl ? authorEl.textContent : '');
            const user = cleanRedditAuthor(rawAuthorText);

            const bodyNodes = extractOwnCommentBodyNodes(container);
            const body = bodyNodes
                .map(node => htmlToMarkdown(node, false).trim())
                .filter(Boolean)
                .join('\n\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            if (body &&
                (/i am a bot, and this action was performed automatically/i.test(body) ||
                /tl;dr generated automatically after/i.test(body))) {
                return null;
            }

            const marker = getDeletedCommentMarker(user, body);
            if (!user && !marker && !body) return null;
            if (user && /^(automoderator|.*-mod-bot)$/i.test(user)) return null;

            return {
                container,
                id: getRedditCommentId(container),
                parentId: getRedditCommentParentId(container),
                user: marker || (/^\[deleted]$/i.test(user) || !user ? '[deleted-account]' : user),
                markerOnly: Boolean(marker),
                isOp: !marker && (
                    extractCommentOpFlag(container, rawAuthorText, bodyNodes) ||
                    Boolean(postAuthor && user && user === postAuthor)
                ),
                timestamp: extractCommentTimestamp(container),
                score: extractCommentScore(container),
                body: marker ? '' : body,
                children: []
            };
        }

        function passesScoreFilter(comment) {
            return typeof comment.score === 'number' && comment.score >= minScore;
        }

        function getRenderedMarkdownText(markdown) {
            return cleanText(String(markdown || '')
                .replace(/```[\s\S]*?```/g, ' ')
                .replace(/`([^`]*)`/g, '$1')
                .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
                .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
                .replace(/^>\s?/gm, '')
                .replace(/[*_~#>-]+/g, ' '));
        }

        function isTrivialLeafComment(comment) {
            if (!trivialFilterEnabled || comment.markerOnly || comment.children.length > 0) return false;
            if (typeof comment.score !== 'number' || comment.score > 1) return false;

            const renderedText = getRenderedMarkdownText(comment.body);
            const wordCount = renderedText ? renderedText.split(/\s+/).filter(Boolean).length : 0;
            return renderedText.length <= 30 && wordCount <= 5;
        }

        function findAncestorComment(container, commentByContainer) {
            let cur = container.parentElement;
            while (cur) {
                if (commentByContainer.has(cur)) return cur;
                const root = cur.getRootNode ? cur.getRootNode() : null;
                cur = cur.parentElement || (root && root.host ? root.host : null);
            }
            return null;
        }

        function renderComment(comment, depth = 0, parent = null) {
            const headingLevel = Math.min(3 + depth, 6);
            const heading = '#'.repeat(headingLevel);
            const userLabel = depth === 0 || !parent
                ? comment.user
                : `${comment.user} → ${parent.user}`;
            const timestampLabel = comment.timestamp &&
                !(isDateOnlyTimestamp(comment.timestamp) &&
                    isDateOnlyTimestamp(postTimestamp) &&
                    comment.timestamp === postTimestamp)
                ? ` · ${comment.timestamp}`
                : '';
            const scoreLabel = typeof comment.score === 'number' ? ` · ${formatRedditScore(comment.score)}` : '';
            const depthLabel = depth > 3 ? ` · d${depth}` : '';
            const opLabel = comment.isOp ? ' · OP' : '';
            const contextLabel = comment.contextOnly ? ' · context only' : '';
            const parts = [`${heading} ${userLabel}${timestampLabel}${scoreLabel}${depthLabel}${opLabel}${contextLabel}`];

            if (!comment.markerOnly) {
                parts.push('', comment.body);
            }

            const children = comment.children.filter(isRenderedComment);
            for (const child of children) {
                if (comment.markerOnly && parts.length === 1) {
                    parts.push(renderComment(child, depth + 1, comment));
                } else {
                    parts.push('', renderComment(child, depth + 1, comment));
                }
            }

            return parts.join('\n');
        }

        function markStructuralRetention(comment) {
            for (const child of comment.children) {
                markStructuralRetention(child);
            }
            comment.droppedByTrivialFilter = isTrivialLeafComment(comment);
            comment.retainedByStructure = (!comment.markerOnly && !comment.droppedByTrivialFilter) ||
                comment.children.some(child => child.retainedByStructure);
            return comment.retainedByStructure;
        }

        function isRenderedComment(comment) {
            return comment.retainedByStructure &&
                (!scoreFilterEnabled || comment.retainedByScoreFilter);
        }

        const comments = commentContainers
            .map(extractComment)
            .filter(Boolean);
        if (comments.length === 0) return '';

        const commentByContainer = new Map(comments.map(comment => [comment.container, comment]));
        const commentById = new Map(comments
            .filter(comment => comment.id)
            .map(comment => [comment.id, comment]));
        const roots = [];

        for (const comment of comments) {
            const parentById = comment.parentId && comment.parentId.startsWith('t1_')
                ? commentById.get(comment.parentId)
                : null;
            const parentContainer = findAncestorComment(comment.container, commentByContainer);
            const parent = parentById || (parentContainer ? commentByContainer.get(parentContainer) : null);

            if (parent && parent !== comment) {
                comment.parent = parent;
                parent.children.push(comment);
            } else {
                comment.parent = null;
                roots.push(comment);
            }
        }

        if (scoreFilterEnabled) {
            for (const comment of comments) {
                comment.passesScoreFilter = passesScoreFilter(comment);
                comment.retainedByScoreFilter = false;
                comment.contextOnly = false;
            }

            for (const comment of comments.filter(item => item.passesScoreFilter)) {
                let current = comment;
                while (current) {
                    current.retainedByScoreFilter = true;
                    current = current.parent;
                }
            }

            for (const comment of comments) {
                comment.contextOnly = comment.retainedByScoreFilter && !comment.passesScoreFilter;
            }
        }

        for (const root of roots) {
            markStructuralRetention(root);
        }

        const renderedRoots = roots.filter(isRenderedComment);
        if (renderedRoots.length === 0) return '';

        return ['## Comments', renderedRoots.map(comment => renderComment(comment)).join('\n\n---\n\n')]
            .filter(Boolean)
            .join('\n\n')
            .trim();
    }

    function extractRedditCommentsFromMarkdown(fullMarkdown) {
        if (!isRedditPage() || !fullMarkdown) return '';

        const markerCandidates = [
            'Join the conversation',
            'Comments Section',
            'Sort by:',
            'Open comment sort options'
        ];
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

            const isNoiseUser = /^automoderator$/i.test(currentUser);
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

            if (
                line.includes('Join the conversation') ||
                line.includes('Comments Section') ||
                line.startsWith('Sort by:') ||
                line.includes('Open comment sort options')
            ) continue;
            if (line.startsWith('[More replies]')) {
                flushCurrent();
                continue;
            }
            if (line.startsWith('[![') || /avatar/i.test(line)) continue;
            if (/^(share|reply|award|vote)$/i.test(line)) continue;
            if (/^\d+\s+(share|reply|award|vote)\b/i.test(line)) continue;

            const userMatch = line.match(/^\[([^\]]+)\]\((?:https?:\/\/(?:www\.)?reddit\.com)?\/(?:user|u)\/[^)]+\)\s*(.*)$/);
            if (userMatch) {
                flushCurrent();
                currentUser = cleanText(userMatch[1]);
                const inlineBody = cleanText(userMatch[2] || '');
                if (inlineBody) bodyLines.push(inlineBody);
                continue;
            }

            const deletedUserMatch = line.match(/^(\[deleted])(?:\s*[·•]\s*(.*))?$/i);
            if (deletedUserMatch) {
                flushCurrent();
                currentUser = '[deleted]';
                const inlineBody = cleanText(deletedUserMatch[2] || '');
                if (inlineBody) bodyLines.push(inlineBody);
                continue;
            }

            if (!currentUser) continue;
            if (/^•\s*\[[^\]]+\]\(\/r\/.*\/comment\//.test(line)) continue;
            if (/^•\s*edited\b/i.test(line)) continue;

            bodyLines.push(line);
        }

        flushCurrent();

        if (comments.length === 0) return '';

        return [
            '## Comments',
            comments
                .map(comment => `---\n\n## ${comment.user}\n\n${comment.body}`)
                .join('\n\n')
        ].join('\n\n').trim();
    }

    function extractRedditCommentsFromVisibleText(visibleText) {
        if (!isRedditPage() || !visibleText) return '';

        const lines = visibleText
            .split(/\n+/)
            .map(line => cleanText(line))
            .filter(Boolean);
        const markerIndex = lines.findIndex(line => (
            line === 'Sort by:' ||
            line.includes('Comments Section') ||
            line.includes('Join the conversation') ||
            line.includes('Search Comments')
        ));
        if (markerIndex === -1) return '';

        const comments = [];
        let i = markerIndex + 1;

        function isDateLine(line) {
            return /^(?:edited\s+)?(?:\d+\s*(?:m|h|d|w|mo|y)\s+ago|just now|today|yesterday|\d{4}-\d{2}-\d{2})$/i.test(line);
        }

        function isPlainAuthorLine(line) {
            const author = cleanRedditAuthor(line);
            if (!author) return false;
            if (/^\[deleted]$/i.test(author)) return true;
            if (!/^[A-Za-z0-9_-]{2,24}$/.test(author)) return false;
            return !/^(reply|share|vote|upvote|downvote|sort|edited)$/i.test(author);
        }

        function headerAt(index) {
            const author = cleanRedditAuthor(lines[index]);
            if (!isPlainAuthorLine(author)) return null;

            for (let j = index + 1; j < Math.min(lines.length, index + 8); j++) {
                const line = lines[j];
                if (line === '•' || /^(op|mod)$/i.test(line)) continue;
                if (isDateLine(line)) {
                    return {
                        author,
                        timestamp: formatDateOnlyTimestamp(line),
                        nextIndex: j + 1
                    };
                }
            }

            return null;
        }

        function isNoiseLine(line) {
            return line === '•' ||
                /^(reply|share|vote|upvote|downvote)$/i.test(line) ||
                /^(op|mod)$/i.test(line) ||
                /^edited\s+/i.test(line) ||
                isDateLine(line) ||
                /^\d+\s+more repl(?:y|ies)$/i.test(line);
        }

        function isStopLine(line) {
            return /^(community info section|community information|created [a-z]{3} \d{1,2}, \d{4}|public|user flair|community resources|official claude resources|r\/[a-z0-9_]+ rules|reddit rules|related communities|moderators|installed apps)$/i.test(line);
        }

        while (i < lines.length) {
            if (isStopLine(lines[i])) break;

            const header = headerAt(i);
            if (!header) {
                i++;
                continue;
            }

            i = header.nextIndex;
            const bodyLines = [];
            while (i < lines.length) {
                if (isStopLine(lines[i]) || headerAt(i)) break;
                if (!isNoiseLine(lines[i])) bodyLines.push(lines[i]);
                i++;
            }

            const body = bodyLines.join('\n\n').trim();
            const isNoiseUser = /^(automoderator|claudeai-mod-bot)$/i.test(header.author);
            const isBotBody = /i am a bot, and this action was performed automatically/i.test(body) ||
                /tl;dr generated automatically after/i.test(body);
            if (!isNoiseUser && !isBotBody && body && !/^\[(deleted|removed)]$/i.test(body)) {
                comments.push({
                    user: header.author,
                    timestamp: header.timestamp,
                    body
                });
            }
        }

        if (comments.length === 0) return '';

        return [
            '## Comments',
            comments
                .map(comment => {
                    const timestampLabel = comment.timestamp ? ` · ${comment.timestamp}` : '';
                    return `---\n\n## ${comment.user}${timestampLabel}\n\n${comment.body}`;
                })
                .join('\n\n')
        ].join('\n\n').trim();
    }

    function buildRedditMarkdown(fullMarkdown) {
        const scraperSettings = getScraperSettings();
        const redditLead = extractRedditLeadMarkdown();
        const redditComments = extractRedditCommentsMarkdown(scraperSettings) ||
            (scraperSettings.redditCommentScoreFilterEnabled ? '' : (
                extractRedditCommentsFromMarkdown(fullMarkdown) ||
                extractRedditCommentsFromVisibleText(document.body?.innerText || '')
            ));

        if (redditLead || redditComments) {
            return [redditLead, redditComments].filter(Boolean).join('\n\n').trim();
        }

        return fullMarkdown;
    }

    function countExportedRedditComments(markdown) {
        if (!markdown) return 0;
        const commentsIndex = markdown.indexOf('## Comments');
        if (commentsIndex === -1) return 0;
        return markdown
            .slice(commentsIndex)
            .split('\n')
            .filter(line => /^#{2,6}\s+/.test(line.trim()) && !/^##\s+Comments\b/.test(line.trim()))
            .length;
    }

    function buildMetadataBlock({ title, author, published, scrapedAt, scraperSettings, redditExportedCommentCount }) {
        const lines = [
            '--- DOCUMENT METADATA ---',
            `TITLE: ${cleanText(title)}`,
            `AUTHOR: ${cleanText(author)}`
        ];

        if (published) {
            lines.push(`PUBLISHED: ${cleanText(published)}`);
        }

        lines.push(`SCRAPED_AT: ${scrapedAt}`);

        if (isRedditPage()) {
            const subreddit = getRedditSubreddit();
            const postScore = getRedditPostScore();
            if (subreddit) lines.push(`SUBREDDIT: ${subreddit}`);
            if (postScore !== null) lines.push(`POST_SCORE: ${postScore}`);
            lines.push(`EXPORTED_COMMENT_COUNT: ${redditExportedCommentCount || 0}`);

            if (scraperSettings.redditCommentScoreFilterEnabled === true) {
                const redditCommentCount = getRedditDisplayedCommentCount();
                if (redditCommentCount !== null) {
                    lines.push(`REDDIT_COMMENT_COUNT: ${redditCommentCount}`);
                }
            }
        }

        lines.push(`SOURCE: ${window.location.href}`);
        lines.push('--- END METADATA ---', '');
        return `${lines.join('\n')}\n`;
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
        let restoreScrollPosition = null;
        if (isRedditPage()) {
            restoreScrollPosition = await waitForRedditHydration();
        }

        const articleNode = findArticleNode();
        const { title, author } = parseMetadata();
        const published = getPublishedTimestamp();
        const scrapedAt = formatScrapedAtTimestamp(new Date());
        const scraperSettings = getScraperSettings();

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

        const metadataBlock = buildMetadataBlock({
            title,
            author,
            published,
            scrapedAt,
            scraperSettings,
            redditExportedCommentCount: isRedditPage() ? countExportedRedditComments(markdown) : 0
        });
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

        if (restoreScrollPosition) restoreScrollPosition();

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
