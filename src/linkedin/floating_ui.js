// src/linkedin/floating_ui.js — UI Injection, Suggestion Pills & Action Buttons
'use strict';

function injectPillStyles() {
  if (document.getElementById('butterfly-pill-styles')) return;
  const style = document.createElement('style');
  style.id = 'butterfly-pill-styles';
  style.textContent = `
    .butterfly-pills-row::-webkit-scrollbar { display: none; }
    .butterfly-pill {
      width: 100%; box-sizing: border-box; padding: 5px 8px; border-radius: 100px;
      border: 1.5px solid #0a66c2; background: #fff; color: #0a66c2; font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-weight: 500; cursor: pointer; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      opacity: 0; transform: translateY(5px); animation: butterfly-pill-in 0.22s ease forwards;
      line-height: 1.45; outline: none; user-select: none; text-align: left;
    }
    .butterfly-pill:hover:not(.butterfly-pill--active) { background: #eaf2fc; }
    .butterfly-pill:active { opacity: 0.85; }
    .butterfly-pill--active { background: #0a66c2; color: #fff; border-color: #0a66c2; animation: none; opacity: 1; transform: none; }
    .butterfly-pill--active:hover { background: #004182; border-color: #004182; }
    .butterfly-pill-ghost {
      flex-shrink: 0; height: 27px; border-radius: 100px;
      background: linear-gradient(90deg, #e8e8e8 25%, #f2f2f2 50%, #e8e8e8 75%);
      background-size: 200% 100%; animation: butterfly-shimmer 1.4s ease-in-out infinite;
    }
    .butterfly-dots-loader { display: inline-flex; align-items: center; gap: 3px; vertical-align: middle; }
    .butterfly-dots-loader span {
      width: 4px; height: 4px; background-color: currentColor; border-radius: 50%;
      display: inline-block; animation: butterfly-dot-pulse 1.2s infinite ease-in-out both;
    }
    .butterfly-dots-loader span:nth-child(1) { animation-delay: -0.32s; }
    .butterfly-dots-loader span:nth-child(2) { animation-delay: -0.16s; }
    .butterfly-dots-loader span:nth-child(3) { animation-delay: 0s; }
    @keyframes butterfly-dot-pulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1.1); opacity: 1; }
    }
    @keyframes butterfly-pill-in { to { opacity: 1; transform: translateY(0); } }
    @keyframes butterfly-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(style);
}

function removePillsWrapper(box) {
  document.querySelectorAll('.butterfly-variants-container, .butterfly-variants-dropdown').forEach(el => el.remove());
  if (!box) return;
  const uiScope = findUiContainerScope(box);
  const uiContainer = uiScope && uiScope.querySelector('.butterfly-ui-container');
  if (uiContainer) {
    uiContainer.querySelectorAll('.butterfly-pills-wrapper').forEach(el => el.remove());
  }
}

function showPillsSkeleton(box) {
  injectPillStyles();
  removePillsWrapper(box);

  const pillsWrapper = document.createElement('div');
  pillsWrapper.className = 'butterfly-pills-wrapper';
  pillsWrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;margin-top:6px;flex-basis:100%;';

  const pillsRow = document.createElement('div');
  pillsRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:2px 2px 5px;width:100%;box-sizing:border-box;';

  [85, 128, 96].forEach(() => {
    const ghost = document.createElement('div');
    ghost.className = 'butterfly-pill-ghost';
    ghost.style.cssText = 'flex:1; min-width:0;';
    pillsRow.appendChild(ghost);
  });

  pillsWrapper.appendChild(pillsRow);
  const uiScope = findUiContainerScope(box);
  const uiContainer = uiScope && uiScope.querySelector('.butterfly-ui-container');
  if (uiContainer) uiContainer.appendChild(pillsWrapper);
}

function addSuggestionPills(box, suggestions, currentIndex = 0) {
  injectPillStyles();
  removePillsWrapper(box);
  if (!suggestions || suggestions.length === 0) return;

  const pillsWrapper = document.createElement('div');
  pillsWrapper.className = 'butterfly-pills-wrapper';
  pillsWrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;margin-top:6px;flex-basis:100%;';

  const pillsRow = document.createElement('div');
  pillsRow.className = 'butterfly-pills-row';
  pillsRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:2px 2px 6px;width:100%;box-sizing:border-box;';

  suggestions.forEach((suggestion, index) => {
    const pill = document.createElement('button');
    pill.className = 'butterfly-pill' + (index === currentIndex ? ' butterfly-pill--active' : '');
    pill.style.animationDelay = (index * 55) + 'ms';
    const displayText = suggestion.length > 20 ? suggestion.substring(0, 20) + '…' : suggestion;
    pill.textContent = displayText;
    pill.title = suggestion;

    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCommentBoxValue(box, suggestion);
      pillsRow.querySelectorAll('.butterfly-pill').forEach((p, i) => {
        p.classList.toggle('butterfly-pill--active', i === index);
      });
    });

    pillsRow.appendChild(pill);
  });

  pillsWrapper.appendChild(pillsRow);
  const uiScope = findUiContainerScope(box);
  const uiContainer = uiScope && uiScope.querySelector('.butterfly-ui-container');
  if (uiContainer) uiContainer.appendChild(pillsWrapper);
}

function getLinkedInEditorWrapper(box) {
  return box.closest('[data-testid="ui-core-tiptap-text-editor-wrapper"], .comments-comment-texteditor, .comments-comment-texteditor__content, .comments-comment-box-comment__text-editor');
}

function getLinkedInEditorBlock(box) {
  const wrapper = getLinkedInEditorWrapper(box);
  if (!wrapper) return null;
  return wrapper.closest('.comments-comment-texteditor, [data-testid="ui-core-tiptap-text-editor-wrapper"]') || wrapper;
}

function applyUiContainerPlacementStyles(uiContainer, placement) {
  uiContainer.dataset.butterflyPlacement = placement;
  uiContainer.classList.remove('butterfly-ui-container--linkedin-toolbar');
  uiContainer.style.cssText = 'display: flex; align-items: center; margin-top: 5px; flex-wrap: wrap; width: 100%;';
}

function findUiInsertionTarget(box, composer) {
  const editorBlock = getLinkedInEditorBlock(box);
  if (editorBlock && editorBlock !== composer && editorBlock.parentElement && composer.contains(editorBlock)) {
    return { parent: editorBlock.parentElement, nextSibling: editorBlock.nextSibling, placement: 'block' };
  }
  const editorWrapper = getLinkedInEditorWrapper(box);
  if (editorWrapper && composer.contains(editorWrapper)) {
    const editorRow = editorWrapper.parentElement && composer.contains(editorWrapper.parentElement) ? editorWrapper.parentElement : editorWrapper;
    return { parent: editorRow.parentElement || composer, nextSibling: editorRow.nextSibling, placement: 'block' };
  }
  if (box.parentElement && composer.contains(box.parentElement)) {
    return { parent: box.parentElement, nextSibling: box.nextSibling, placement: 'block' };
  }
  return { parent: composer, nextSibling: null, placement: 'block' };
}

function placeUiContainer(uiContainer, box, composer) {
  const target = findUiInsertionTarget(box, composer);
  applyUiContainerPlacementStyles(uiContainer, target.placement);
  const nextSibling = target.nextSibling === uiContainer ? uiContainer.nextSibling : target.nextSibling;
  if (uiContainer.parentElement !== target.parent || uiContainer.nextSibling !== nextSibling) {
    target.parent.insertBefore(uiContainer, nextSibling);
  }
}

function injectUI(box, postElement) {
  if (!linkedinEnabled) return;
  const composer = findCommentComposer(box);
  if (!composer) return;

  if (!box.dataset.butterflyId) {
    box.dataset.butterflyId = 'li-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
  }

  const existingContainers = composer.querySelectorAll('.butterfly-ui-container');
  if (existingContainers.length > 0) {
    existingContainers.forEach((container, index) => {
      if (index > 0) container.remove();
    });
    existingContainers[0].dataset.commentboxId = box.dataset.butterflyId;
    placeUiContainer(existingContainers[0], box, composer);
    composer.dataset.butterflyInjected = 'true';
    box.dataset.butterflyInjected = 'true';
    return;
  }

  if (box.dataset.butterflyInjected === 'true' || composer.dataset.butterflyInjected === 'true') return;
  composer.dataset.butterflyInjected = 'true';
  box.dataset.butterflyInjected = 'true';

  const uiContainer = document.createElement('div');
  uiContainer.className = 'butterfly-ui-container';
  uiContainer.dataset.commentboxId = box.dataset.butterflyId;

  const suggestBtn = document.createElement('button');
  suggestBtn.innerHTML = `${LINKEDIN_IN_ICON_SVG}${SPARKLE_ICON_SVG}Suggest`;
  suggestBtn.className = 'butterfly-suggest-btn butterfly-btn';
  suggestBtn.style.cssText = 'margin-left:5px;margin-top:5px;';
  uiContainer.appendChild(suggestBtn);

  placeUiContainer(uiContainer, box, composer);

  suggestBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isExtensionContextValid()) {
      alert('Extension was updated. Please refresh the page to continue using NetworkMaxx.');
      return;
    }
    if (!linkedinEnabled) {
      removeLinkedInUI();
      return;
    }

    const originalText = suggestBtn.innerHTML;
    suggestBtn.disabled = true;
    suggestBtn.innerHTML = '<span class="butterfly-dots-loader"><span></span><span></span><span></span></span>';
    clearSuggestionError(box);
    showPillsSkeleton(box);
    const { postText, postAuthor } = extractPostInfo(postElement, box);
    const result = await getGeminiSuggestion(postText, postAuthor);
    removePillsWrapper(box);
    if (result.error) {
      showSuggestionError(box, result.error);
    } else if (result.disabled) {
      removeLinkedInUI();
      return;
    } else if (result.suggestions && result.suggestions.length > 0) {
      setCommentBoxValue(box, result.suggestions[0]);
      addSuggestionPills(box, result.suggestions, 0);
    }
    suggestBtn.disabled = false;
    suggestBtn.innerHTML = originalText;
  };

  performInitialAutoSuggestion(box, postElement, suggestBtn);
}
