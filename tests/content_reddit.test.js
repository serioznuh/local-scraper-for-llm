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

  click() {
    if (typeof this.onClick === 'function') this.onClick();
  }
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

function redditCompactFormatDocument() {
  return new FakeDocument(el('body', {}, [
    el('main', {}, [
      el('shreddit-post', { created: '2026-01-06T10:00:00.000Z', score: '334', 'comment-count': '91' }, [
        el('h1', {}, ['So I stumbled across this prompt hack']),
        el('p', {}, ['After Claude finishes coding a feature, run this.'])
      ]),
      el('textarea', {}, []),
      el('h2', {}, ['Comments Section']),
      el('shreddit-comment', { author: 'enthusiast_bob OP', thingid: 't1_root', created: '2026-01-06T10:10:00.000Z', score: '334' }, [
        el('div', { id: 't1_root-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Root comment body only.'])
        ]),
        el('shreddit-comment', { author: 'soopypoopy132', thingid: 't1_child', parentid: 't1_root', created: '2026-01-06T10:20:00.000Z', score: '26' }, [
          el('div', { id: 't1_child-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Child reply body only.'])
          ]),
          el('shreddit-comment', { author: 'enthusiast_bob OP', thingid: 't1_late_op', parentid: 't1_child', created: '2026-01-12T11:30:00.000Z', score: '8' }, [
            el('div', { id: 't1_late_op-comment-rtjson-content', slot: 'comment' }, [
              el('p', {}, ['Late OP follow-up body.'])
            ])
          ])
        ]),
        el('shreddit-comment', { author: '[deleted]', thingid: 't1_removed_parent', parentid: 't1_root', created: '2026-01-06T10:30:00.000Z', score: '-8' }, [
          el('div', { id: 't1_removed_parent-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['[removed]'])
          ]),
          el('shreddit-comment', { author: 'useful_child', thingid: 't1_useful_child', parentid: 't1_removed_parent', created: '2026-01-06T10:40:00.000Z', score: '5' }, [
            el('div', { id: 't1_useful_child-comment-rtjson-content', slot: 'comment' }, [
              el('p', {}, ['Useful child reply body.'])
            ])
          ])
        ]),
        el('shreddit-comment', { author: '[deleted]', thingid: 't1_deleted_leaf', parentid: 't1_root', created: '2026-01-06T10:50:00.000Z', score: '-1' }, [
          el('div', { id: 't1_deleted_leaf-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['[deleted]'])
          ])
        ])
      ])
    ])
  ]));
}

function redditQaReviewFixtureDocument() {
  const document = new FakeDocument(el('body', {}, [
    el('main', {}, [
      el('shreddit-post', { created: '2026-01-06T10:00:00.000Z', score: '334', 'comment-count': '91' }, [
        el('h1', {}, ['Reddit QA Review Fixture']),
        el('p', {}, [
          'Review ',
          el('a', { href: 'http://current-state.md' }, ['current-state.md']),
          ', ',
          el('a', { href: 'http://decisions.md' }, ['decisions.md']),
          ', and ',
          el('a', { href: 'http://code-landmarks.md' }, ['code-landmarks.md']),
          '. Also see ',
          el('a', { href: '/r/promptrequest/' }, ['r/promptrequest']),
          '.'
        ])
      ]),
      el('textarea', {}, []),
      el('h2', {}, ['Comments Section']),
      el('shreddit-comment', { author: 'enthusiast_bob', thingid: 't1_root', created: '2026-01-06T10:10:00.000Z', score: '42' }, [
        el('div', { id: 't1_root-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Root conversation.'])
        ]),
        el('shreddit-comment', { author: 'Shumuu', thingid: 't1_shumuu', parentid: 't1_root', created: '2026-01-06T10:11:00.000Z', score: '1' }, [
          el('div', { id: 't1_shumuu-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Could you share it?'])
          ])
        ]),
        el('shreddit-comment', { author: '9fxd', thingid: 't1_9fxd', parentid: 't1_root', created: '2026-01-06T10:12:00.000Z', score: '1' }, [
          el('div', { id: 't1_9fxd-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['TIL :o'])
          ])
        ]),
        el('shreddit-comment', { author: 'Visionioso', thingid: 't1_visionioso', parentid: 't1_root', created: '2026-01-06T10:13:00.000Z', score: '3' }, [
          el('div', { id: 't1_visionioso-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['I wonder if this competes with anything.'])
          ]),
          el('shreddit-comment', { thingid: 't1_op_zero', parentid: 't1_visionioso', created: '2026-01-06T10:14:00.000Z', score: '0' }, [
            el('a', { href: '/user/cleancodecrew/', slot: 'author', 'author-distinguished': 'op' }, ['cleancodecrew']),
            el('div', { id: 't1_op_zero-comment-rtjson-content', slot: 'comment' }, [
              el('p', {}, ['Why so? are you building something similar?'])
            ])
          ])
        ]),
        el('shreddit-comment', { author: 'suprachromat', thingid: 't1_suprachromat', parentid: 't1_root', created: '2026-01-06T10:15:00.000Z', score: '9' }, [
          el('div', { id: 't1_suprachromat-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Are you planning to publish the workflow?'])
          ]),
          el('shreddit-comment', { thingid: 't1_op_reply', parentid: 't1_suprachromat', created: '2026-01-06T10:16:00.000Z', score: '29' }, [
            el('a', { href: '/user/cleancodecrew/', slot: 'author', 'is-op': 'true' }, ['cleancodecrew']),
            el('div', { id: 't1_op_reply-comment-rtjson-content', slot: 'comment' }, [
              el('p', {}, ['Yes, I am packaging it up.'])
            ])
          ])
        ]),
        el('shreddit-comment', { author: 'first_branch', thingid: 't1_first_branch', parentid: 't1_root', created: '2026-01-06T10:17:00.000Z', score: '5' }, [
          el('div', { id: 't1_first_branch-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['First branch body.'])
          ]),
          el('shreddit-comment', { author: 'second_branch', thingid: 't1_second_branch', parentid: 't1_first_branch', created: '2026-01-06T10:18:00.000Z', score: '4' }, [
            el('div', { id: 't1_second_branch-comment-rtjson-content', slot: 'comment' }, [
              el('p', {}, ['Second branch body.'])
            ]),
            el('shreddit-comment', { thingid: 't1_deleted_parent', parentid: 't1_second_branch', created: '2026-01-06T10:19:00.000Z', score: '-2' }, [
              el('div', { id: 't1_deleted_parent-comment-rtjson-content', slot: 'comment' }, [
                el('p', {}, ['Comment removed by moderator'])
              ]),
              el('shreddit-comment', { author: 'chiviet234', thingid: 't1_chiviet234', parentid: 't1_deleted_parent', created: '2026-01-06T10:20:00.000Z', score: '7' }, [
                el('div', { id: 't1_chiviet234-comment-rtjson-content', slot: 'comment' }, [
                  el('p', {}, ['Your 20 dollar of credits go bye bye'])
                ])
              ])
            ])
          ])
        ])
      ])
    ])
  ]));
  document.title = 'Reddit QA Review Fixture : r/ClaudeAI';
  return document;
}

function redditPlainOpBadgeDocument() {
  return new FakeDocument(el('body', {}, [
    el('main', {}, [
      el('shreddit-post', { created: '2026-01-06T10:00:00.000Z' }, [
        el('h1', {}, ['Reddit OP Badge Fixture']),
        el('p', {}, ['Post body.'])
      ]),
      el('textarea', {}, []),
      el('h2', {}, ['Comments Section']),
      el('shreddit-comment', { author: 'suprachromat', thingid: 't1_parent', created: '2026-01-06T10:10:00.000Z', score: '9' }, [
        el('div', { id: 't1_parent-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Parent comment body.'])
        ]),
        el('shreddit-comment', { author: 'cleancodecrew', thingid: 't1_plain_op', parentid: 't1_parent', created: '2026-01-06T10:11:00.000Z', score: '29' }, [
          el('span', {}, ['OP']),
          el('div', { id: 't1_plain_op-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['Plain badge OP reply body.'])
          ])
        ])
      ])
    ])
  ]));
}

function redditCollapsedMoreRepliesDocument() {
  const visionioso = el('shreddit-comment', { author: 'Visionioso', thingid: 't1_visionioso', parentid: 't1_root', created: '2026-01-06T10:13:00.000Z', score: '3' }, [
    el('div', { id: 't1_visionioso-comment-rtjson-content', slot: 'comment' }, [
      el('p', {}, ['I wonder if this competes with anything.'])
    ])
  ]);
  const visionMore = el('faceplate-partial', {}, [
    el('button', {}, ['1 more reply'])
  ]);
  visionMore.children[0].onClick = () => {
    if (visionMore.expanded) return;
    visionMore.expanded = true;
    visionioso.append(el('shreddit-comment', { author: 'cleancodecrew', thingid: 't1_op_zero', parentid: 't1_visionioso', created: '2026-01-06T10:14:00.000Z', score: '0' }, [
      el('span', {}, ['OP']),
      el('div', { id: 't1_op_zero-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['Why so? are you building something similar?'])
      ])
    ]));
  };
  visionioso.append(visionMore);

  const secondBranch = el('shreddit-comment', { author: 'second_branch', thingid: 't1_second_branch', parentid: 't1_first_branch', created: '2026-01-06T10:18:00.000Z', score: '4' }, [
    el('div', { id: 't1_second_branch-comment-rtjson-content', slot: 'comment' }, [
      el('p', {}, ['Second branch body.'])
    ])
  ]);
  const deletedMore = el('faceplate-partial', {}, [
    el('button', {}, ['1 more reply'])
  ]);
  deletedMore.children[0].onClick = () => {
    if (deletedMore.expanded) return;
    deletedMore.expanded = true;
    secondBranch.append(el('shreddit-comment', { thingid: 't1_deleted_parent', parentid: 't1_second_branch', created: '2026-01-06T10:19:00.000Z', score: '-2' }, [
      el('div', { id: 't1_deleted_parent-comment-rtjson-content', slot: 'comment' }, [
        el('p', {}, ['[deleted]'])
      ]),
      el('shreddit-comment', { author: 'chiviet234', thingid: 't1_chiviet234', parentid: 't1_deleted_parent', created: '2026-01-06T10:20:00.000Z', score: '7' }, [
        el('div', { id: 't1_chiviet234-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Your 20 dollar of credits go bye bye'])
        ])
      ])
    ]));
  };
  secondBranch.append(deletedMore);

  return new FakeDocument(el('body', {}, [
    el('main', {}, [
      el('shreddit-post', { author: 'cleancodecrew', created: '2026-01-06T10:00:00.000Z' }, [
        el('h1', {}, ['Reddit Collapsed Replies Fixture']),
        el('p', {}, ['Post body.'])
      ]),
      el('textarea', {}, []),
      el('h2', {}, ['Comments Section']),
      el('shreddit-comment', { author: 'enthusiast_bob', thingid: 't1_root', created: '2026-01-06T10:10:00.000Z', score: '42' }, [
        el('div', { id: 't1_root-comment-rtjson-content', slot: 'comment' }, [
          el('p', {}, ['Root conversation.'])
        ]),
        visionioso,
        el('shreddit-comment', { author: 'first_branch', thingid: 't1_first_branch', parentid: 't1_root', created: '2026-01-06T10:17:00.000Z', score: '5' }, [
          el('div', { id: 't1_first_branch-comment-rtjson-content', slot: 'comment' }, [
            el('p', {}, ['First branch body.'])
          ]),
          secondBranch
        ])
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

async function runContentScript(document, scraperSettings = {}, locationOverride = null) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  const location = locationOverride || {
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

function normalizeDynamicMetadata(content) {
  return content.replace(/^SCRAPED_AT: .+$/m, 'SCRAPED_AT: <SCRAPED_AT>');
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
  assert.match(result.content, /### Seninut · 5mo ago · \+1/);
  assert.match(result.content, /Why do you not trust it/);
  assert.match(result.content, /### Own_Professional6525 · 5mo ago · \+1/);
  assert.match(result.content, /thorough review is still key/);
  assert.match(result.content, /### False_Care_2957 · 5mo ago · \+1/);
  assert.match(result.content, /Codex on top of the first couple of passes/);
});

test('Reddit compact format preserves LLM structure with less repeated metadata', async () => {
  const result = await runContentScript(redditCompactFormatDocument(), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 2
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /^SCRAPED_AT: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/m);
  assert.match(result.content, /^SUBREDDIT: r\/ClaudeAI$/m);
  assert.match(result.content, /^POST_SCORE: 334$/m);
  assert.match(result.content, /^EXPORTED_COMMENT_COUNT: 5$/m);
  assert.match(result.content, /^REDDIT_COMMENT_COUNT: 91$/m);
  assert.match(result.content, /### enthusiast_bob · \+334 · OP\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · \+26\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 2026-01-12 · \+8 · OP\n\nLate OP follow-up body\./);
  assert.match(result.content, /#### \[removed-by-mod] → enthusiast_bob · -8 · context only\n##### useful_child → \[removed-by-mod] · \+5\n\nUseful child reply body\./);
  assert.doesNotMatch(result.content, /\[deleted-by-user]/);
  assert.doesNotMatch(result.content, /\[deleted]\n/);
  assert.doesNotMatch(result.content, /\[removed]\n/);
  assert.doesNotMatch(result.content, /· 2026-01-06/);
  assert.doesNotMatch(result.content, /score 334/);
});

test('Reddit displayed comment count metadata is only emitted with score filtering', async () => {
  const result = await runContentScript(redditCompactFormatDocument());

  assert.equal(result.error, undefined);
  assert.match(result.content, /^EXPORTED_COMMENT_COUNT: 5$/m);
  assert.doesNotMatch(result.content, /^REDDIT_COMMENT_COUNT:/m);
});

test('Reddit-only metadata stays out of non-Reddit exports', async () => {
  const result = await runContentScript(redditCompactFormatDocument(), {}, {
    hostname: 'example.com',
    pathname: '/article',
    href: 'https://example.com/article'
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /^SCRAPED_AT: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/m);
  assert.doesNotMatch(result.content, /^SUBREDDIT:/m);
  assert.doesNotMatch(result.content, /^POST_SCORE:/m);
  assert.doesNotMatch(result.content, /^EXPORTED_COMMENT_COUNT:/m);
  assert.doesNotMatch(result.content, /^REDDIT_COMMENT_COUNT:/m);
});

test('Reddit compact format smoke output keeps the saved Markdown contract parseable', async () => {
  const result = await runContentScript(redditCompactFormatDocument(), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 2
  });

  assert.equal(result.error, undefined);
  const metadataEnd = result.content.indexOf('--- END METADATA ---');
  const commentsStart = result.content.indexOf('## Comments');
  assert.ok(metadataEnd > 0);
  assert.ok(commentsStart > metadataEnd);
  assert.match(result.content, /SOURCE: https:\/\/www\.reddit\.com\/r\/ClaudeAI\/comments\/example\/thread\//);
  assert.match(result.content, /After Claude finishes coding a feature, run this\./);
  assert.equal((result.content.match(/^#{3,6}\s+/gm) || []).length, 5);
});

test('Reddit QA review fixture matches the golden compact Markdown output by default', async () => {
  const result = await runContentScript(redditQaReviewFixtureDocument(), {}, {
    hostname: 'www.reddit.com',
    pathname: '/r/ClaudeAI/comments/1q5a90l/',
    href: 'https://www.reddit.com/r/ClaudeAI/comments/1q5a90l/'
  });
  const expected = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'reddit_1q5a90l_golden.md'),
    'utf8'
  ).trim();

  assert.equal(result.error, undefined);
  assert.equal(normalizeDynamicMetadata(result.content), expected);
  assert.match(result.content, /###### \[removed-by-mod] → second_branch · -2\n###### chiviet234 → \[removed-by-mod] · \+7 · d4\n\nYour 20 dollar of credits go bye bye/);
  assert.doesNotMatch(result.content, /Comment removed by moderator/);
  assert.doesNotMatch(result.content, /\[deleted-account] → second_branch/);
  assert.match(result.content, /#### cleancodecrew → suprachromat · \+29 · OP/);
  assert.match(result.content, /#### Shumuu → enthusiast_bob · \+1\n\nCould you share it\?/);
  assert.doesNotMatch(result.content, /\[current-state\.md]\(http:\/\/current-state\.md\)/);
});

test('Reddit OP marker detects plain OP badge text in a comment header', async () => {
  const result = await runContentScript(redditPlainOpBadgeDocument(), {}, {
    hostname: 'www.reddit.com',
    pathname: '/r/ClaudeAI/comments/1q5a90l/',
    href: 'https://www.reddit.com/r/ClaudeAI/comments/1q5a90l/'
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /#### cleancodecrew → suprachromat · \+29 · OP\n\nPlain badge OP reply body\./);
});

test('Reddit extraction expands collapsed more-replies controls before exporting comments', async () => {
  const result = await runContentScript(redditCollapsedMoreRepliesDocument(), {}, {
    hostname: 'www.reddit.com',
    pathname: '/r/ClaudeAI/comments/1q5a90l/',
    href: 'https://www.reddit.com/r/ClaudeAI/comments/1q5a90l/'
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /##### cleancodecrew → Visionioso · 0 · OP\n\nWhy so\? are you building something similar\?/);
  assert.match(result.content, /###### \[deleted-by-user] → second_branch · -2\n###### chiviet234 → \[deleted-by-user] · \+7 · d4\n\nYour 20 dollar of credits go bye bye/);
});

test('Reddit trivial leaf filter is opt-in and uses body length, words, score, and child count together', async () => {
  const defaultResult = await runContentScript(redditQaReviewFixtureDocument(), {}, {
    hostname: 'www.reddit.com',
    pathname: '/r/ClaudeAI/comments/1q5a90l/',
    href: 'https://www.reddit.com/r/ClaudeAI/comments/1q5a90l/'
  });
  const filteredResult = await runContentScript(redditQaReviewFixtureDocument(), {
    redditTrivialCommentFilterEnabled: true
  }, {
    hostname: 'www.reddit.com',
    pathname: '/r/ClaudeAI/comments/1q5a90l/',
    href: 'https://www.reddit.com/r/ClaudeAI/comments/1q5a90l/'
  });

  assert.equal(defaultResult.error, undefined);
  assert.match(defaultResult.content, /#### Shumuu → enthusiast_bob · \+1\n\nCould you share it\?/);
  assert.match(defaultResult.content, /#### 9fxd → enthusiast_bob · \+1\n\nTIL :o/);
  assert.match(defaultResult.content, /##### cleancodecrew → Visionioso · 0 · OP\n\nWhy so\? are you building something similar\?/);

  assert.equal(filteredResult.error, undefined);
  assert.doesNotMatch(filteredResult.content, /Shumuu/);
  assert.doesNotMatch(filteredResult.content, /9fxd/);
  assert.match(filteredResult.content, /##### cleancodecrew → Visionioso · 0 · OP\n\nWhy so\? are you building something similar\?/);
  assert.match(filteredResult.content, /###### chiviet234 → \[removed-by-mod] · \+7 · d4\n\nYour 20 dollar of credits go bye bye/);
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
  assert.match(result.content, /### enthusiast_bob · 5mo ago · \+2\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+3\n\nGrandchild reply body only\./);
  assert.match(result.content, /### parallel_user · 4mo ago · 0\n\nParallel root body only\./);
  assert.doesNotMatch(result.content, /ClaudeAI-mod-bot/);
  assert.doesNotMatch(result.content, /TL;DR generated automatically/);

  const rootSection = result.content.slice(
    result.content.indexOf('### enthusiast_bob · 5mo ago · \+2'),
    result.content.indexOf('#### soopypoopy132 → enthusiast_bob')
  );
  assert.doesNotMatch(rootSection, /Child reply body only/);
  assert.doesNotMatch(rootSection, /Grandchild reply body only/);
});

test('Reddit structured extraction survives comment-start markers after comments', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({ commentStartAfterComments: true }));

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · \+2\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1\n\nChild reply body only\./);
  assert.match(result.content, /### parallel_user · 4mo ago · 0\n\nParallel root body only\./);
});

test('Reddit structured extraction uses compact reply headings and marks capped depth', async () => {
  const result = await runContentScript(redditStructuredThreadDocument({
    greatGrandchildScore: '4',
    greatGreatGrandchildScore: '5'
  }));

  assert.equal(result.error, undefined);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+3\n\nGrandchild reply body only\./);
  assert.match(result.content, /###### deep_reply_user → enthusiast_bob · 5mo ago · \+4\n\nGreat grandchild reply body only\./);
  assert.match(result.content, /###### deeper_reply_user → deep_reply_user · 5mo ago · \+5 · d4\n\nGreat great grandchild reply body only\./);
  assert.doesNotMatch(result.content, /Reply to /);
  assert.doesNotMatch(result.content, /· d3/);
});

test('Reddit structured extraction filters comments below the configured score', async () => {
  const result = await runContentScript(redditStructuredThreadDocument(), {
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 2
  });

  assert.equal(result.error, undefined);
  assert.match(result.content, /### enthusiast_bob · 5mo ago · \+2\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+3\n\nGrandchild reply body only\./);
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
  assert.match(result.content, /### enthusiast_bob · 5mo ago · \+1 · context only\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+4\n\nGrandchild reply body only\./);
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
  assert.match(result.content, /### enthusiast_bob · 5mo ago · \+3\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+3\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+1 · context only\n\nGrandchild reply body only\./);
  assert.match(result.content, /###### deep_reply_user → enthusiast_bob · 5mo ago · \+4\n\nGreat grandchild reply body only\./);
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
  assert.match(result.content, /### enthusiast_bob · 5mo ago · \+1 · context only\n\nRoot comment body only\./);
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+3\n\nGrandchild reply body only\./);
  assert.match(result.content, /##### second_descendant → soopypoopy132 · 5mo ago · \+4\n\nSecond grandchild reply body only\./);
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
  assert.match(result.content, /#### soopypoopy132 → enthusiast_bob · 5mo ago · \+1 · context only\n\nChild reply body only\./);
  assert.match(result.content, /##### enthusiast_bob → soopypoopy132 · 5mo ago · \+3\n\nGrandchild reply body only\./);
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
  assert.match(result.content, /### parallel_user · 4mo ago · \+5\n\nParallel root body only\./);
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
