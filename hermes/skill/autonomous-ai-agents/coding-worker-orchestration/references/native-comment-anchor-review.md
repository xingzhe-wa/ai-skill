# Native Comment Anchor Review

Use this reference when a browser extension needs to reproduce a document editor's inline comment behavior.

## Feasibility

A local-only implementation can approach native annotation behavior, but it cannot guarantee recovery after the source text is materially edited or deleted. It should preserve a layered selector and report when recovery degrades.

## Required Selector

Persist an optional selector alongside the comment:

- `exact`: selected text.
- `prefix` / `suffix`: short normalized context around the selection.
- `position.start` / `position.end`: offsets within the selected content block.
- `blockFingerprint`: normalized block text fingerprint.
- `containerFingerprint`: fingerprint for the relevant content region.
- `blockIndex`: nearby structural position.
- Optional legacy DOM path for compatibility, never as the only anchor.

## Locator Order

1. Identify the current document content root and candidate block elements.
2. Match `prefix + exact + suffix` inside candidate blocks.
3. Use block/container fingerprints and position distance to disambiguate duplicate exact text.
4. Restore the block-local position if the quote match is unavailable.
5. Use legacy Range/DOM path only for older comments.
6. Fall back to normalized selected-text search, then anchor/block highlighting.
7. Retry a bounded number of times when the editor renders content asynchronously.

When converting a match to a DOM `Range`, never use an index from normalized text against raw text-node strings. Build an explicit normalized-character-to-original-node/offset map, or use an equivalent TreeWalker range algorithm.

## Tests

At minimum cover:

- Duplicate exact text in different blocks, with prefix/suffix selecting the intended block.
- Newlines, non-breaking spaces, and zero-width characters.
- DOM node structure changes while quote/fingerprint recovery still succeeds.
- Old comments without the new selector using legacy fallback behavior.
- Schema validation and round-trip persistence of the selector.

## Cross-Paragraph Text Matching (critical pitfall)

When a user selects text spanning multiple block elements (`<p>解析</p><p>这是一道</p>`), `window.getSelection().toString()` returns text with `\n` between blocks. After whitespace normalization (`\s+` → ` `), the stored `selectedText` becomes `"解析 这是一道"` (with space). But the DOM's separate text nodes concatenate as `"解析这是一道"` (no space). Every text-search layer — TextQuote, selectedText global scan, anchor fallback — fails because the query has a space the DOM doesn't.

**Fix:** In the normalized-text-to-DOM mapping function, detect when consecutive `Text` nodes belong to different block-level elements (via `parentElement.closest(TEXT_BLOCK_SELECTOR)`). Insert a synthetic space character into the normalized map at each block boundary. The synthetic space's `start`/`end` boundaries can both point to `{ node: nextTextNode, offset: 0 }` since it represents an inter-block gap, not an intra-text whitespace run.

This fix applies to **both** the single-block search (`createExactTextRange`) and the global search path, since both use the same `createNormalizedTextMap` function. Without it, any comment created from a multi-paragraph selection will be permanently unlocatable.

**Verify with actual stored comment data:** Read `private-comments.json` and check whether `selectedText` contains `\n` or multi-paragraph content. If it does, the normalized search must handle block boundaries — a unit test that only passes single-paragraph strings will never catch this.

## Browser-Native window.find() As Primary Locator (post-mortem)

The layered TextQuote/TextPosition/fingerprint approach above is theoretically correct but **failed completely on Yuque**. Root cause: Yuque uses a self-built Lake editor whose content container is nested 20+ levels deep with CSS Module hashed class names (e.g. `BookReader-module_content_nI4YV`). Every `CONTENT_ROOT_SELECTOR` guess missed the actual content root; every `querySelectorAll('p,h1,h2,...')` call returned zero blocks because Yuque paragraphs may not use standard HTML tags. All five locator layers returned null on text that was visibly on the page.

**The nuclear option that worked: `window.find()`.**

`window.find(query, caseSensitive, backwards, wrapAround, wholeWord, searchInFrames, showDialog)` is a non-standard but Chrome-fully-supported API. It delegates the entire text-matching and scrolling problem to the browser engine:
- No DOM structure assumptions whatsoever
- Automatic cross-node, cross-paragraph, cross-container matching
- Automatic scroll-to-match behavior
- Automatic selection creation

Implementation pattern:
1. Normalize the search text and generate candidate substrings (full text, first sentence, first 30-50 chars, last segment) — `window.find()` may fail on very long or cross-paragraph queries, so try progressively shorter candidates.
2. Call `window.find(candidate)` for each candidate; check `window.getSelection().toString()` to confirm a real match.
3. If found, use the browser-created selection range for highlighting.
4. Fall back to DOM text-node search (the layered approach above) only if `window.find()` is unavailable or fails.
5. Retry with a delay (800ms × 5) for dynamically rendered content.

**Pre-coding gate: verify the target platform's DOM structure before building any text-search pipeline.** Use browser tools (CDP, snapshot, console evaluation) to inspect the actual content container selectors and paragraph tag types. If the platform uses a custom editor (Yuque Lake, Notion, Feishu/Lark docs, etc.), assume standard HTML tags and stable CSS classes will NOT match. Either build a platform-specific selector discovery routine or skip DOM selectors entirely and use `window.find()`.

## Acceptance

Inspect the emitted content script, not only source tests. Confirm the selector is generated when saving a new comment, is passed through create/update messages, and is attempted before global text search. Verify user feedback distinguishes native-like selector recovery from fallback or source-changed failure. For platforms with custom editors, verify `window.find()` is called with candidate substrings and that the browser-created selection is used for scroll/highlight — not just a DOM Range constructed from normalized text indices.
