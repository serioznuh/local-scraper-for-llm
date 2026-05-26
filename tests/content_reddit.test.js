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

function redditPostWithPromotedMediaDocument() {
  return new FakeDocument(el('body', {}, [
    el('main', {}, [
      el('shreddit-post', {}, [
        el('h1', {}, ['So I stumbled across this prompt hack']),
        el('p', {}, ['After Claude finishes coding a feature, run this.']),
        el('figure', {}, [
          el('img', {
            src: 'https://i.redd.it/post-image.jpeg',
            alt: 'Post diagram'
          }, [])
        ])
      ]),
      el('div', { 'data-testid': 'placement' }, [
        el('span', {}, ['Promotion']),
        el('figure', {}, [
          el('img', {
            src: 'https://external-preview.redd.it/ad-preview.jpeg',
            alt: 'Clickable image which will reveal the video player: This agent can source, rank, and contact candidates for technical roles. Built by the team at Airtable.'
          }, [])
        ])
      ]),
      el('textarea', {}, []),
      el('h2', {}, ['Comments Section']),
      el('shreddit-comment', { author: 'enthusiast_bob', thingid: 't1_root', created: '5mo ago', score: '3' }, [
        el('div', { id: 't1_root-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Root comment body only.'])
        ])
      ])
    ])
  ]));
}

function redditLazyTailCommentsDocument() {
  const main = el('main', {}, [
    el('h1', {}, ['So I stumbled across this prompt hack']),
    el('p', {}, ['After Claude finishes coding a feature, run this.']),
    el('textarea', {}, []),
    el('h2', {}, ['Comments Section']),
    el('shreddit-comment', { author: 'Seninut', thingid: 't1_seninut', created: '5mo ago', score: '1' }, [
      el('div', { id: 't1_seninut-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['Why do you not trust it? It is not lying, try asking.'])
      ])
    ])
  ]);
  const document = new FakeDocument(el('body', {}, [main]));
  document.loadLazyTailComments = () => {
    if (document.lazyTailLoaded) return;
    document.lazyTailLoaded = true;
    main.append(el('shreddit-comment', {
      author: 'Own_Professional6525',
      thingid: 't1_own_professional',
      created: '5mo ago',
      score: '1'
    }, [
      el('div', { id: 't1_own_professional-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['This is a great reminder that thorough review is still key.'])
      ])
    ]));
    main.append(el('shreddit-comment', {
      author: 'False_Care_2957',
      thingid: 't1_false_care',
      created: '5mo ago',
      score: '1'
    }, [
      el('div', { id: 't1_false_care-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['I usually just do this with Codex on top of the first couple of passes.'])
      ])
    ]));
  };
  return document;
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
  const {
    commentStartAfterComments = false,
    rootScore = '2',
    childScore = '1',
    grandchildScore = '3',
    greatGrandchildScore,
    childSiblingScore,
    grandchildSiblingScore,
    parallelScore = '0',
    parallelActionRowScore = null,
    greatGreatGrandchildScore
  } = options;
  const withScore = (attributes, score) => {
    if (score === null || score === undefined) return attributes;
    return Object.assign({}, attributes, { score });
  };
  const commentStart = el('textarea', {}, []);
  const children = [
    el('h1', {}, ['So I stumbled across this prompt hack']),
    el('p', {}, ['After Claude finishes coding a feature, run this.'])
  ];
  if (!commentStartAfterComments) children.push(commentStart);
  children.push(
    el('shreddit-comment', withScore({ author: 'ClaudeAI-mod-bot', thingid: 't1_bot', created: '5mo ago' }, '100'), [
      el('div', { id: 't1_bot-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['TL;DR generated automatically after 100 comments.'])
      ])
    ]),
    el('shreddit-comment', withScore({ author: 'enthusiast_bob', thingid: 't1_root', created: '5mo ago' }, rootScore), [
      el('div', { id: 't1_root-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['Root comment body only.'])
      ]),
      el('shreddit-comment', withScore({
        author: 'soopypoopy132',
        thingid: 't1_child',
        parentid: 't1_root',
        created: '5mo ago'
      }, childScore), [
        el('div', { id: 't1_child-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Child reply body only.'])
        ]),
        el('shreddit-comment', withScore({
          author: 'enthusiast_bob',
          thingid: 't1_grandchild',
          parentid: 't1_child',
          created: '5mo ago'
        }, grandchildScore), [
          el('div', { id: 't1_grandchild-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Grandchild reply body only.'])
          ]),
          ...(greatGrandchildScore === undefined ? [] : [
            el('shreddit-comment', withScore({
              author: 'deep_reply_user',
              thingid: 't1_great_grandchild',
              parentid: 't1_grandchild',
              created: '5mo ago'
            }, greatGrandchildScore), [
              el('div', { id: 't1_great_grandchild-comment-rtjson-content', slot: 'comment' }, [
                el('p', {}, ['Great grandchild reply body only.'])
              ]),
              ...(greatGreatGrandchildScore === undefined ? [] : [
                el('shreddit-comment', withScore({
                  author: 'deeper_reply_user',
                  thingid: 't1_great_great_grandchild',
                  parentid: 't1_great_grandchild',
                  created: '5mo ago'
                }, greatGreatGrandchildScore), [
                  el('div', { id: 't1_great_great_grandchild-comment-rtjson-content', slot: 'comment' }, [
                    el('p', {}, ['Great great grandchild reply body only.'])
                  ])
                ])
              ])
            ])
          ])
        ]),
        ...(grandchildSiblingScore === undefined ? [] : [
          el('shreddit-comment', withScore({
            author: 'second_descendant',
            thingid: 't1_grandchild_sibling',
            parentid: 't1_child',
            created: '5mo ago'
          }, grandchildSiblingScore), [
            el('div', { id: 't1_grandchild_sibling-comment-rtjson-content', slot: 'comment' }, [
              el('p', {}, ['Second grandchild reply body only.'])
            ])
          ])
        ])
      ]),
      ...(childSiblingScore === undefined ? [] : [
        el('shreddit-comment', withScore({
          author: 'sibling_reply_user',
          thingid: 't1_child_sibling',
          parentid: 't1_root',
          created: '5mo ago'
        }, childSiblingScore), [
          el('div', { id: 't1_child_sibling-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Sibling reply body only.'])
          ])
        ])
      ])
    ]),
    el('shreddit-comment', withScore({ author: 'parallel_user', thingid: 't1_parallel', created: '4mo ago' }, parallelScore), [
      el('div', { id: 't1_parallel-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['Parallel root body only.'])
      ]),
      ...(parallelActionRowScore === null ? [] : [
        el('shreddit-comment-action-row', { score: parallelActionRowScore }, [])
      ])
    ])
  );
  if (commentStartAfterComments) children.push(commentStart);

  return new FakeDocument(el('body', {}, [
    el('main', {}, children)
  ]));
}

async function runContentScript(document, scraperSettings = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  const location = {
    hostname: 'www.reddit.com',
    pathname: '/r/ClaudeAI/comments/example/thread/',
    href: 'https://www.reddit.com/r/ClaudeAI/comments/example/thread/'
  };
  const context = {
    document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    URL,
    window: {
      document,
      location,
      __scraperSettings: scraperSettings,
      scrollX: 0,
      scrollY: 0,
      innerHeight: 800,
      addEventListener() {},
      clearInterval,
      clearTimeout,
      getComputedStyle() {
        return { display: 'block', visibility: 'visible' };
      },
      scrollBy() {
        if (typeof document.loadLazyTailComments === 'function') {
          document.loadLazyTailComments();
        }
      },
      scrollTo() {},
      setInterval(callback) {
        return setInterval(callback, 0);
      },
      setTimeout(callback) {
        return setTimeout(callback, 0);
      }
    }
  };
  context.location = location;
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

test('Reddit lead skips promoted media outside the current post', async () => {
  const result = await runContentScript(redditPostWithPromotedMediaDocument());

  assert.equal(result.error, undefined);
  assert.match(result.content, /After Claude finishes coding a feature/);
  assert.match(result.content, /!\[Post diagram]\(https:\/\/i\.redd\.it\/post-image\.jpeg\)/);
  assert.match(result.content, /## Comments/);
  assert.doesNotMatch(result.content, /Airtable/);
  assert.doesNotMatch(result.content, /external-preview\.redd\.it\/ad-preview/);
});

test('Reddit extraction prompts lazy tail comments before exporting', async () => {
  const result = await runContentScript(redditLazyTailCommentsDocument());

  assert.equal(result.error, undefined);
  assert.match(result.content, /### Seninut · 5mo ago · score 1/);
  assert.match(result.content, /Why do you not trust it/);
  assert.match(result.content, /### Own_Professional6525 · 5mo ago · score 1/);
  assert.match(result.content, /thorough review is still key/);
  assert.match(result.content, /### False_Care_2957 · 5mo ago · score 1/);
  assert.match(result.content, /Codex on top of the first couple of passes/);
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
  assert.match(result.content, /### enthusiast_bob · 5mo ago · score 2\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 3\n\nGrandchild reply body only\./);
  assert.match(result.content, /### parallel_user · 4mo ago · score 0\n\nParallel root body only\./);
  assert.doesNotMatch(result.content, /ClaudeAI-mod-bot/);
  assert.doesNotMatch(result.content, /TL;DR generated automatically/);

  const rootSection = result.content.slice(
    result.content.indexOf('### enthusiast_bob · 5mo ago · score 2'),
    result.content.indexOf('#### soopypoopy132 → enthusiast_bob')
  );
  assert.doesNotMatch(rootSection, /Child reply body only/);
  assert.doesNotMatch(rootSection, /Grandchild reply body only/);
});

test('Reddit structured extraction survives comment-start markers after comments', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({ commentStartAfterComments: true }));

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · score 2\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1\n\nChild reply body only\./);
  assert.match(result.content, /### parallel_user · 4mo ago · score 0\n\nParallel root body only\./);
});

test('Reddit structured extraction uses compact reply headings and marks capped depth', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    greatGrandchildScore: '4',
    greatGreatGrandchildScore: '5'
  }));

  assert.equal(result.error, undefined);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 3\n\nGrandchild reply body only\./);
  assert.match(result.content, /###### deep_reply_user → enthusiast_bob · 5mo ago · score 4\n\nGreat grandchild reply body only\./);
  assert.match(result.content, /###### deeper_reply_user → deep_reply_user · 5mo ago · score 5 · d4\n\nGreat great grandchild reply body only\./);
  assert.doesNotMatch(result.content, /Reply to /);
  assert.doesNotMatch(result.content, /· d3/);
});

test('Reddit structured extraction filters comments below the configured score', async () => {
  const result = await runContentScript(redditStructuredThreadDocument(), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 2
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · score 2\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 3\n\nGrandchild reply body only\./);
  assert.doesNotMatch(result.content, /Parallel root body only\./);
});

test('Reddit score filter preserves low-score ancestors as context for retained descendants', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    rootScore: '1',
    childScore: '1',
    grandchildScore: '4',
    parallelScore: '0'
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 4
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · score 1 · context only\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 4\n\nGrandchild reply body only\./);
  assert.doesNotMatch(result.content, /Parallel root body only\./);
});

test('Reddit score filter drops low-score siblings beside retained context paths', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    rootScore: '1',
    childScore: '1',
    childSiblingScore: '1',
    grandchildScore: '3',
    parallelScore: '1'
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 3
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /Root comment body only\./);
  assert.match(result.content, /Child reply body only\./);
  assert.match(result.content, /Grandchild reply body only\./);
  assert.doesNotMatch(result.content, /Sibling reply body only\./);
  assert.doesNotMatch(result.content, /Parallel root body only\./);
});

test('Reddit score filter drops low-score descendants unless they lead to retained replies', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    rootScore: '3',
    childScore: '3',
    grandchildScore: '1',
    greatGrandchildScore: '4',
    parallelScore: '0'
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 3
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · score 3\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 3\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 1 · context only\n\nGrandchild reply body only\./);
  assert.match(result.content, /###### deep_reply_user → enthusiast_bob · 5mo ago · score 4\n\nGreat grandchild reply body only\./);
  assert.doesNotMatch(result.content, /Parallel root body only\./);

  const withoutRetainedDescendant = await runContentScript(redditStructuredThreadDocument({
    rootScore: '3',
    childScore: '3',
    grandchildScore: '1',
    parallelScore: '0'
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 3
  });

  assert.equal(withoutRetainedDescendant.error, undefined);
  assert.doesNotMatch(withoutRetainedDescendant.content, /Grandchild reply body only\./);
});

test('Reddit score filter shares context chain for multiple retained descendants', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    rootScore: '1',
    childScore: '1',
    grandchildScore: '3',
    grandchildSiblingScore: '4',
    parallelScore: '0'
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 3
  });

  assert.equal(result.error, undefined);
  assert.equal(result.content.indexOf('Root comment body only.'), result.content.lastIndexOf('Root comment body only.'));
  assert.equal(result.content.indexOf('Child reply body only.'), result.content.lastIndexOf('Child reply body only.'));
  assert.match(result.content, /### enthusiast_bob · 5mo ago · score 1 · context only\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 3\n\nGrandchild reply body only\./);
  assert.match(result.content, /##### second_descendant → soopypoopy132 · 5mo ago · score 4\n\nSecond grandchild reply body only\./);
});

test('Reddit score filter retains unknown-score ancestors only as context', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    rootScore: null,
    childScore: '1',
    grandchildScore: '3',
    parallelScore: null
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 3
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · context only\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · score 1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · score 3\n\nGrandchild reply body only\./);
  assert.doesNotMatch(result.content, /Parallel root body only\./);
});

test('Reddit score filter drops comments with unavailable scores', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    parallelScore: null
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 0
  });

  assert.equal(result.error, undefined);
  assert.doesNotMatch(result.content, /Parallel root body only\./);
});

test('Reddit structured extraction falls back to action row scores', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    parallelScore: null,
    parallelActionRowScore: '5'
  }), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 5
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /### parallel_user · 4mo ago · score 5\n\nParallel root body only\./);
});

test('Reddit score filter skips comments from unscored fallback text', async () => {
  const result = await runContentScript(redditVisibleTextOnlyDocument(), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 2
  });

  assert.equal(result.error, undefined);
  assert.doesNotMatch(result.content, /## Comments/);
  assert.doesNotMatch(result.content, /Try the local review plugin against your git diff/);
});
