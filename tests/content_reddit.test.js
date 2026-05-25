const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class TextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentElement = null;
  }

  get textContent() {
    return this.nodeValue;
  }

  getRootNode() {
    return this.parentElement ? this.parentElement.getRootNode() : null;
  }
}

class ElementNode {
  constructor(tagName, attributes = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.children = [];
    this.parentElement = null;
    this.shadowRoot = null;
    this.dataset = {};
    this.className = '';
    this.innerTextOverride = null;

    for (const [name, value] of Object.entries(attributes)) {
      this.setAttribute(name, value);
    }
    for (const child of children) {
      this.append(child);
    }
  }

  append(child) {
    const node = typeof child === 'string' ? new TextNode(child) : child;
    node.parentElement = this;
    this.childNodes.push(node);
    if (node.nodeType === 1) this.children.push(node);
    return node;
  }

  setAttribute(name, value) {
    const attrName = name.toLowerCase();
    const attrValue = String(value);
    this.attributes.set(attrName, attrValue);
    if (attrName === 'class') this.className = attrValue;
    if (attrName.startsWith('data-')) {
      const key = attrName.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = attrValue;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) || null;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  get textContent() {
    return this.childNodes.map(child => child.textContent || '').join('');
  }

  get innerText() {
    return this.innerTextOverride ?? this.textContent;
  }

  set innerText(value) {
    this.innerTextOverride = value;
  }

  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  getRootNode() {
    let cur = this;
    while (cur.parentElement) cur = cur.parentElement;
    return cur.ownerDocument || cur;
  }

  matches(selector) {
    return selector
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .some(part => this.matchesSingle(part));
  }

  matchesSingle(selector) {
    let rest = selector.trim();
    if (!rest) return false;

    if (rest.startsWith('.')) {
      const className = rest.slice(1);
      return this.className.split(/\s+/).includes(className);
    }

    const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
    if (tagMatch) {
      if (this.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }

    const attrPattern = /\[([^\]=~^$*\s]+)\s*([*^$]?=)?\s*(?:"([^"]*)"|'([^']*)'|([^\]]+))?\]/g;
    let match;
    while ((match = attrPattern.exec(rest)) !== null) {
      const [, rawName, operator, doubleQuoted, singleQuoted, bareValue] = match;
      const actual = this.getAttribute(rawName) || '';
      const expected = (doubleQuoted ?? singleQuoted ?? bareValue ?? '').trim();
      if (!operator && !actual) return false;
      if (operator === '=' && actual !== expected) return false;
      if (operator === '*=' && !actual.includes(expected)) return false;
      if (operator === '^=' && !actual.startsWith(expected)) return false;
      if (operator === '$=' && !actual.endsWith(expected)) return false;
    }

    return true;
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        walk(child);
      }
    };
    walk(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  scrollIntoView() {}
}

class FakeDocument {
  constructor(body) {
    this.nodeType = 9;
    this.title = 'Reddit fixture : r/ClaudeAI';
    this.readyState = 'complete';
    this.body = body;
    this.documentElement = new ElementNode('html', {}, [body]);
    this.documentElement.ownerDocument = this;
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function el(tagName, attributes, children) {
  return new ElementNode(tagName, attributes, children);
}

function redditFixtureDocument() {
  return new FakeDocument(el('body', {}, [
    el('main', {}, [
      el('h1', {}, ['So I stumbled across this prompt hack']),
      el('p', {}, ['After Claude finishes coding a feature, run this.']),
      el('textarea', {}, []),
      el('h2', {}, ['Comments Section']),
      el('div', {}, [
        el('a', { href: '/user/enthusiast_bob/' }, ['enthusiast_bob']),
        ' 5mo ago Try the local review plugin against your git diff.'
      ]),
      el('div', {}, [
        el('a', { href: '/user/soopypoopy132/' }, ['soopypoopy132']),
        ' 5mo ago would this not take a crazy amount of tokens?'
      ])
    ])
  ]));
}

function redditVisibleTextOnlyDocument() {
  const body = el('body', {}, [
    el('main', {}, [
      el('h1', {}, ['So I stumbled across this prompt hack']),
      el('p', {}, ['After Claude finishes coding a feature, run this.'])
    ])
  ]);
  body.innerText = [
    'So I stumbled across this prompt hack',
    'After Claude finishes coding a feature, run this.',
    'Share',
    'Sort by:',
    'ClaudeAI-mod-bot',
    '•',
    '5mo ago',
    '•',
    'Edited 5mo ago',
    'TL;DR generated automatically after 100 comments.',
    'Reply',
    'Share',
    'enthusiast_bob',
    '•',
    '5mo ago',
    '•',
    'Edited 5mo ago',
    'Try the local review plugin against your git diff.',
    'The one caveat is, it only does that on PRs.',
    'Reply',
    'Share',
    'soopypoopy132',
    '•',
    '5mo ago',
    'would this not take a crazy amount of tokens?',
    'Reply',
    'Share',
    'Created Jan 23, 2023',
    'Public',
    'USER FLAIR',
    'nicknicklson',
    'COMMUNITY RESOURCES',
    'Claude Workflow Library',
    'Community Info Section'
  ].join('\n');

  return new FakeDocument(body);
}

function redditStructuredThreadDocument(options = {}) {
  const { commentStartAfterComments = false } = options;
  const commentStart = el('textarea', {}, []);
  const children = [
    el('h1', {}, ['So I stumbled across this prompt hack']),
    el('p', {}, ['After Claude finishes coding a feature, run this.'])
  ];
  if (!commentStartAfterComments) children.push(commentStart);
  children.push(
    el('shreddit-comment', { author: 'ClaudeAI-mod-bot', thingid: 't1_bot', created: '5mo ago' }, [
      el('div', { id: 't1_bot-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['TL;DR generated automatically after 100 comments.'])
      ])
    ]),
    el('shreddit-comment', { author: 'enthusiast_bob', thingid: 't1_root', created: '5mo ago' }, [
      el('div', { id: 't1_root-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['Root comment body only.'])
      ]),
      el('shreddit-comment', {
        author: 'soopypoopy132',
        thingid: 't1_child',
        parentid: 't1_root',
        created: '5mo ago'
      }, [
        el('div', { id: 't1_child-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Child reply body only.'])
        ]),
        el('shreddit-comment', {
          author: 'enthusiast_bob',
          thingid: 't1_grandchild',
          parentid: 't1_child',
          created: '5mo ago'
        }, [
          el('div', { id: 't1_grandchild-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Grandchild reply body only.'])
          ])
        ])
      ])
    ]),
    el('shreddit-comment', { author: 'parallel_user', thingid: 't1_parallel', created: '4mo ago' }, [
      el('div', { id: 't1_parallel-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['Parallel root body only.'])
      ])
    ])
  );
  if (commentStartAfterComments) children.push(commentStart);

  return new FakeDocument(el('body', {}, [
    el('main', {}, children)
  ]));
}

async function runContentScript(document) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  const context = {
    document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    URL,
    window: {
      document,
      location: {
        hostname: 'www.reddit.com',
        pathname: '/r/ClaudeAI/comments/example/thread/',
        href: 'https://www.reddit.com/r/ClaudeAI/comments/example/thread/'
      },
      scrollX: 0,
      scrollY: 0,
      innerHeight: 800,
      addEventListener() {},
      clearInterval,
      clearTimeout,
      getComputedStyle() {
        return { display: 'block', visibility: 'visible' };
      },
      scrollBy() {},
      scrollTo() {},
      setInterval(callback) {
        return setInterval(callback, 0);
      },
      setTimeout(callback) {
        return setTimeout(callback, 0);
      }
    }
  };
  context.globalThis = context;
  return await vm.runInNewContext(source, context, { filename: 'content.js' });
}

test('Reddit fallback extracts comments after the current Comments Section heading', async () => {
  const result = await runContentScript(redditFixtureDocument());

  assert.equal(result.error, undefined);
  assert.match(result.content, /## Comments/);
  assert.match(result.content, /## enthusiast_bob/);
  assert.match(result.content, /Try the local review plugin against your git diff/);
  assert.match(result.content, /## soopypoopy132/);
  assert.match(result.content, /would this not take a crazy amount of tokens/);
});

test('Reddit fallback extracts comments from visible page text when comment DOM is unavailable', async () => {
  const result = await runContentScript(redditVisibleTextOnlyDocument());

  assert.equal(result.error, undefined);
  assert.match(result.content, /## Comments/);
  assert.doesNotMatch(result.content, /ClaudeAI-mod-bot/);
  assert.doesNotMatch(result.content, /TL;DR generated automatically/);
  assert.match(result.content, /## enthusiast_bob · 5mo ago/);
  assert.match(result.content, /Try the local review plugin against your git diff/);
  assert.match(result.content, /The one caveat is, it only does that on PRs/);
  assert.match(result.content, /## soopypoopy132 · 5mo ago/);
  assert.match(result.content, /would this not take a crazy amount of tokens/);
  assert.doesNotMatch(result.content, /USER FLAIR/);
  assert.doesNotMatch(result.content, /Claude Workflow Library/);
});

test('Reddit structured extraction preserves nested reply threads', async () => {
  const result = await runContentScript(redditStructuredThreadDocument());

  assert.equal(result.error, undefined);
  assert.match(result.content, /## Comments/);
  assert.match(result.content, /### enthusiast_bob · 5mo ago\n\nRoot comment body only\./);
  assert.match(result.content, /#### Reply to enthusiast_bob: soopypoopy132 · 5mo ago\n\nChild reply body only\./);
  assert.match(result.content, /##### Reply to soopypoopy132: enthusiast_bob · 5mo ago\n\nGrandchild reply body only\./);
  assert.match(result.content, /### parallel_user · 4mo ago\n\nParallel root body only\./);
  assert.doesNotMatch(result.content, /ClaudeAI-mod-bot/);
  assert.doesNotMatch(result.content, /TL;DR generated automatically/);

  const rootSection = result.content.slice(
    result.content.indexOf('### enthusiast_bob · 5mo ago'),
    result.content.indexOf('#### Reply to enthusiast_bob: soopypoopy132')
  );
  assert.doesNotMatch(rootSection, /Child reply body only/);
  assert.doesNotMatch(rootSection, /Grandchild reply body only/);
});

test('Reddit structured extraction survives comment-start markers after comments', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({ commentStartAfterComments: true }));

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago\n\nRoot comment body only\./);
  assert.match(result.content, /#### Reply to enthusiast_bob: soopypoopy132 · 5mo ago\n\nChild reply body only\./);
  assert.match(result.content, /### parallel_user · 4mo ago\n\nParallel root body only\./);
});
