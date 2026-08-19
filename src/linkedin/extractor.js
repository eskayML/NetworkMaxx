// src/linkedin/extractor.js — Post Context & Comment Box Extractor
'use strict';

const LINKEDIN_POST_CONTAINER_SELECTOR = [
  '.feed-shared-update-v2',
  '.update-components-update',
  '.occludable-update',
  '[data-urn^="urn:li:activity"]',
  '[data-id^="urn:li:activity"]',
  '[componentkey*="FeedType_"]',
  '[role="listitem"]'
].join(', ');

const LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR = [
  '[aria-label^="Open control menu for post by "]',
  '[aria-label^="Hide post by "]'
].join(', ');

function hasLinkedInPostSignals(element) {
  if (!element || !element.querySelector) return false;
  return Boolean(
    element.querySelector(LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR) ||
    element.querySelector('[data-ad-preview="message"], [componentkey^="feed-commentary"], [componentkey*="feed-commentary"]') ||
    element.querySelector('.feed-shared-update-v2__description, .update-components-update-v2__commentary, .update-components-text')
  );
}

function findLinkedInPostElementFromCommentBox(commentBox) {
  if (!commentBox) return null;
  const closestKnown = commentBox.closest(LINKEDIN_POST_CONTAINER_SELECTOR);
  if (closestKnown && closestKnown.tagName !== 'MAIN' && hasLinkedInPostSignals(closestKnown)) {
    return closestKnown;
  }
  let node = commentBox.parentElement;
  while (node && node !== document.body) {
    if (node.tagName === 'MAIN') return null;
    if (hasLinkedInPostSignals(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function findLinkedInPostHeader(postElement) {
  if (!postElement) return null;
  const legacyHeader = postElement.querySelector('.update-components-actor, .feed-shared-actor, .social-details-social-actor');
  if (legacyHeader) return legacyHeader;

  const control = postElement.querySelector(LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR);
  let node = control && control.parentElement;
  while (node && node !== postElement) {
    if (node.querySelector('a[href*="/in/"], a[href*="/company/"]')) return node;
    node = node.parentElement;
  }
  return null;
}

function findReplyContext(commentBox) {
  const replyBox = commentBox.closest('.comments-comment-box--reply, .social-details-social-comment-box--reply, [class*="comment-box"][class*="reply"]');
  if (!replyBox) return null;
  const directComment = replyBox.closest('article.comments-comment-entity, .comments-comment-entity');
  if (directComment) return directComment;

  let node = replyBox.previousElementSibling;
  while (node) {
    if (node.matches && node.matches('article.comments-comment-entity, .comments-comment-entity')) {
      return node;
    }
    const nested = node.querySelector && node.querySelector('article.comments-comment-entity, .comments-comment-entity');
    if (nested) return nested;
    node = node.previousElementSibling;
  }
  return null;
}

function extractPostInfo(postElement, commentBox) {
  const scopedPostElement = findLinkedInPostElementFromCommentBox(commentBox) || postElement;

  if (commentBox) {
    const parentArticle = findReplyContext(commentBox);
    if (parentArticle) {
      const commentTextElem = findFirstWithText(parentArticle, [
        '.comments-comment-item__main-content',
        '.comments-comment-item__inline-show-more-text',
        '.comments-comment-item-content-body',
        '[class*="comments-comment-item"][class*="content"]',
        '.feed-shared-inline-show-more-text'
      ]);

      const commentAuthorElem = findFirstWithText(parentArticle, [
        '.comments-comment-meta__description-title',
        '.comments-comment-meta__actor-name',
        '.comments-post-meta__name',
        '.comments-comment-meta__description-container span[aria-hidden="true"]',
        'a[href*="/in/"] span[aria-hidden="true"]',
        'a[href*="/company/"] span[aria-hidden="true"]'
      ]);

      if (commentTextElem || commentAuthorElem) {
        const postText = getElementText(commentTextElem);
        const postAuthor = getElementText(commentAuthorElem);
        console.log('[Butterfly] Replying to comment - Author:', postAuthor, 'Text:', postText);
        return { postText, postAuthor };
      }
    }
  }

  const mainTextElem = findFirstWithText(scopedPostElement, [
    '[data-testid="expandable-text-box"]',
    '[componentkey*="feed-commentary"] span[tabindex]',
    '[componentkey*="feed-commentary"] span',
    '[data-ad-preview="message"]',
    '.feed-shared-update-v2__description',
    '.update-components-text span',
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '.update-components-update-v2__commentary'
  ]);
  const postText = getElementText(mainTextElem);

  const authorFromControls = findFirstAuthorName(scopedPostElement, [
    LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR
  ]);

  const visibleHeader = findLinkedInPostHeader(scopedPostElement);
  let postAuthor = authorFromControls || findFirstAuthorName(visibleHeader, [
    'a[href*="/in/"] img[alt]',
    'a[href*="/company/"] img[alt]',
    'a[href*="/in/"] svg[aria-label]',
    'a[href*="/company/"] svg[aria-label]',
    'a[href*="/in/"][aria-label]',
    'a[href*="/company/"][aria-label]',
    '.feed-shared-actor__name',
    '.update-components-actor__name',
    '.feed-shared-actor__meta a',
    '.update-components-actor__meta a',
    '.update-components-actor__title span[aria-hidden="true"]',
    '.feed-shared-actor__title span[aria-hidden="true"]',
    '.update-components-actor__title',
    '.feed-shared-actor__title',
    '.feed-shared-actor__container-link span[aria-hidden="true"]',
    '.update-components-actor__container-link span[aria-hidden="true"]',
    '.social-details-social-actor__name',
    '.social-details-social-actor__title span[aria-hidden="true"]',
    '.actor-name',
    'span[dir="ltr"] span[aria-hidden="true"]',
    '[aria-label*="  1st"]',
    '[aria-label*="  2nd"]',
    '[aria-label*="  3rd"]',
    'a[href*="/in/"] span[aria-hidden="true"]',
    'a[href*="/company/"] span[aria-hidden="true"]'
  ]);

  if (!postAuthor) {
    const header = scopedPostElement.querySelector('.feed-shared-actor, .update-components-actor');
    if (header) postAuthor = getElementAuthorName(header.querySelector('a, span'));
  }

  if (!postAuthor) {
    postAuthor = findFirstAuthorName(visibleHeader, [
      'a[href*="/company/"] span[aria-hidden="true"]',
      'a[href*="/in/"] span[aria-hidden="true"]',
      'span[aria-hidden="true"]'
    ]);
  }

  return { postText, postAuthor };
}

function findPostElementFromCommentBoxScope(box) {
  return findLinkedInPostElementFromCommentBox(box) ||
    box.closest('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]') ||
    box.closest('article:not(.comments-comment-entity), [role="article"]:not(.comments-comment-entity)') ||
    null;
}

function findPostElementFromCommentBox(box) {
  return findPostElementFromCommentBoxScope(box);
}

function findCommentComposer(box) {
  return box.closest('.comments-comment-box, .comments-comment-box__form, .social-details-social-comment-box, form.comments-comment-box, [componentkey^="commentBox-"]') ||
    box.closest('.comments-comment-texteditor') ||
    box.closest('.comments-comment-texteditor__content, .comments-comment-box-comment__text-editor, [data-testid="ui-core-tiptap-text-editor-wrapper"]') ||
    box.parentElement;
}

function findUiContainerScope(box) {
  return findCommentComposer(box) || box.parentElement || document.body;
}

function isLinkedInCommentBox(box) {
  if (!box || box.dataset.butterflyUiContainer === 'true') return false;
  if (box.closest('.butterfly-ui-container')) return false;
  if (box.closest('.share-box-feed-entry, .share-creation-state, .share-box, [data-test-modal-id="share-box"]')) return false;
  if (box.closest('.comments-comment-box, .comments-comment-texteditor, .comments-comment-texteditor__content, .comments-comment-box-comment__text-editor, .social-details-social-comment-box, form.comments-comment-box, [componentkey^="commentBox-"], [data-testid="ui-core-tiptap-text-editor-wrapper"]')) return true;

  const label = [
    box.getAttribute('aria-label'),
    box.getAttribute('aria-placeholder'),
    box.getAttribute('data-placeholder'),
    box.getAttribute('placeholder')
  ].filter(Boolean).join(' ').toLowerCase();

  if (label.includes('comment') || label.includes('reply')) return true;

  return Boolean(
    box.classList.contains('ql-editor') &&
    findPostElementFromCommentBoxScope(box) &&
    box.closest('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]')
  );
}

function getCanonicalCommentBox(box) {
  if (!box) return null;
  if (!box.isContentEditable) return box;

  if (box.querySelector('[contenteditable="true"]')) {
    return box.querySelector(
      '.ql-editor[contenteditable="true"], [data-lexical-editor="true"][contenteditable="true"], .tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], [contenteditable="true"]'
    );
  }
  return box;
}

function setLexicalEditorValue(box, value) {
  try {
    const editor = box.__lexicalEditor;
    if (!editor || typeof editor.parseEditorState !== 'function' || typeof editor.setEditorState !== 'function') {
      return false;
    }
    const state = editor.parseEditorState(JSON.stringify({
      root: {
        children: [{
          children: [{ detail: 0, format: 0, mode: 'normal', text: value, type: 'text', version: 1 }],
          direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1
        }],
        direction: 'ltr', format: '', indent: 0, type: 'root', version: 1
      }
    }));
    editor.setEditorState(state);
    return true;
  } catch (err) {
    return false;
  }
}
