# Multi-chat history and responsive UI

This fork extends the existing Flowise embed rather than replacing the Prediction API or the message renderer.

## Features
- **Desktop:** A toggleable left sidebar listing conversations. In floating mode, opening the sidebar expands the chat window.
- **Mobile (up to 640px):** Full-screen conversation view; the history button opens a full-screen conversation list with a close button.
- **New chat:** A fresh Flowise `chatId` and empty conversation, without affecting previously saved chats.
- **Conversation history:** Stored per chatflow in browser `localStorage` under `<chatflowid>_EXTERNAL_THREADS_V1`. The current Flowise session continues to use the existing `<chatflowid>_EXTERNAL` storage format.
- **Migration:** Existing single-session history is imported on first use if it contains a user message.
- **Deletion:** Each conversation can be deleted after confirmation.
- **No login or backend database required.** The current Markdown, image, file upload and voice components remain the original ones.

## Important limitations
- Conversations exist **only in the current browser/profile**. They do not sync between devices. Clearing site data also clears saved conversations.
- `localStorage` has a relatively small storage quota. Text chats are supported; this is not a suitable place for large binary uploads.
- This feature does **not** resolve security issues in the archived Flowise backend.
- While the Flowise response is being generated, switching and deleting threads is disabled to avoid cross-session stream corruption.
- The existing `clearChatOnReload` behaviour is disabled inside the multi-chat workspace to preserve conversations.

## Storage and compatibility

The Flowise `Bot` component assumes one active session. The workspace mounts a fresh `Bot` when selecting a thread and restores that thread into the existing session storage format. All Flowise requests still pass the selected `chatId`. Message rendering is unchanged.

## Manual acceptance tests

1. Open full-page chat on desktop, send a message, then open and close the history sidebar.
2. Start a second chat; send a different message; switch back and check the original content and Flowise context.
3. Refresh the page. Verify both conversations remain selectable.
4. Open the floating widget at desktop width. Verify opening the history sidebar expands the window without overflowing the viewport.
5. On a phone-sized viewport, verify the chat occupies the whole screen and history occupies a separate full-screen view.
6. Verify Markdown links, Markdown images, voice recording and attachments still work.
7. Delete a chat and verify the other conversations remain.
8. Test migration with an existing `<chatflowid>_EXTERNAL` saved conversation.

The implementation has not yet been validated against a live Flowise instance. Before merging, run `npm install` followed by `npm run build` and complete the acceptance tests.
