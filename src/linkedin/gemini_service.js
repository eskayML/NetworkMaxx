// src/linkedin/gemini_service.js — Chrome Runtime Messaging & Gemini API Client
'use strict';

async function getGeminiSuggestion(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('[Butterfly LinkedIn] Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });

  return new Promise((resolve) => {
    try {
      if (!isExtensionContextValid()) {
        console.error('[Butterfly LinkedIn] Extension context is not available');
        showContextInvalidatedMessage();
        resolve({ error: 'Extension context lost. Please refresh the page.' });
        return;
      }

      chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'linkedin', postText, postAuthor, refinement, currentComment }, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = (chrome.runtime.lastError && chrome.runtime.lastError.message) || String(chrome.runtime.lastError);
          console.warn('[Butterfly] sendMessage error:', errMsg);

          if (errMsg.includes('context invalidated')) {
            showContextInvalidatedMessage();
            resolve({ error: 'Extension was updated. Please refresh the page.' });
            return;
          }

          if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
            console.log('[Butterfly] Service worker may be sleeping — retrying in 600ms...');
            setTimeout(() => {
              try {
                chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'linkedin', postText, postAuthor, refinement, currentComment }, (retryResponse) => {
                  const retryErr = chrome.runtime.lastError;
                  if (retryErr) {
                    resolve({ error: 'Could not reach NetworkMaxx. Try clicking Suggest again.' });
                    return;
                  }
                  if (retryResponse && retryResponse.error) resolve({ error: retryResponse.error });
                  else if (retryResponse && retryResponse.disabled) resolve({ disabled: true });
                  else if (retryResponse && retryResponse.suggestions) {
                    if (retryResponse.debugPrompt) console.log('[Butterfly LinkedIn] Debug prompt:\n', retryResponse.debugPrompt);
                    resolve({ suggestions: retryResponse.suggestions });
                  } else resolve({ error: 'No suggestion received' });
                });
              } catch (_) {
                resolve({ error: 'Could not reach NetworkMaxx. Try clicking Suggest again.' });
              }
            }, 600);
            return;
          }

          resolve({ error: 'Connection error. Click Suggest to try again.' });
          return;
        }

        if (response && response.error) resolve({ error: response.error });
        else if (response && response.disabled) resolve({ disabled: true });
        else if (response && response.suggestions) {
          if (response.debugPrompt) console.log('[Butterfly LinkedIn] Debug prompt:\n', response.debugPrompt);
          resolve({ suggestions: response.suggestions });
        } else resolve({ error: 'No suggestion received' });
      });
    } catch (error) {
      resolve({ error: 'Extension was updated. Please refresh the page to continue using NetworkMaxx.' });
    }
  });
}

async function getGeminiConnectionNotes(profileData) {
  console.log('[NetworkMaxx:EasyConnect] Requesting connection notes for:', profileData);

  return new Promise((resolve) => {
    try {
      if (!isExtensionContextValid()) {
        showContextInvalidatedMessage();
        resolve({ error: 'Extension context lost. Please refresh the page.' });
        return;
      }

      chrome.runtime.sendMessage({
        type: 'GEMINI_CONNECT_NOTE',
        ...profileData
      }, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = (chrome.runtime.lastError && chrome.runtime.lastError.message) || String(chrome.runtime.lastError);
          console.warn('[NetworkMaxx:EasyConnect] sendMessage error:', errMsg);

          if (errMsg.includes('context invalidated')) {
            showContextInvalidatedMessage();
            resolve({ error: 'Extension was updated. Please refresh the page.' });
            return;
          }

          if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
            setTimeout(() => {
              try {
                chrome.runtime.sendMessage({ type: 'GEMINI_CONNECT_NOTE', ...profileData }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    resolve({ error: 'Could not reach NetworkMaxx. Try clicking again.' });
                    return;
                  }
                  if (retryResponse && retryResponse.error) resolve({ error: retryResponse.error });
                  else if (retryResponse && retryResponse.notes) resolve({ notes: retryResponse.notes });
                  else resolve({ error: 'No connection notes generated' });
                });
              } catch (_) {
                resolve({ error: 'Could not reach NetworkMaxx.' });
              }
            }, 600);
            return;
          }

          resolve({ error: 'Connection error. Please try again.' });
          return;
        }

        if (response && response.error) resolve({ error: response.error });
        else if (response && response.notes) resolve({ notes: response.notes });
        else resolve({ error: 'No connection notes generated' });
      });
    } catch (error) {
      resolve({ error: 'Extension was updated. Please refresh the page.' });
    }
  });
}

