import { createSignal, For, Show, onCleanup } from 'solid-js';
import { v4 as uuidv4 } from 'uuid';
import { Bot, BotProps, MessageType, observersConfigType } from '@/components/Bot';
import { getLocalStorageChatflow } from '@/utils';

type ChatThread = {
  id: string;
  chatId: string;
  title: string;
  messages: MessageType[];
  updatedAt: number;
};

type InitialWorkspace = {
  activeId: string;
  threads: ChatThread[];
};

export type ChatWorkspaceProps = BotProps & {
  historyEnabled?: boolean;
};

const historyKey = (flowId: string) => flowId + '_EXTERNAL_THREADS_V1';
const activeChatKey = (flowId: string) => flowId + '_EXTERNAL';
const containsUserMessage = (messages: MessageType[]) => messages.some((item) => item.type === 'userMessage');

const getThreadTitle = (messages: MessageType[]) => {
  const firstQuestion = messages.find((item) => item.type === 'userMessage')?.message?.trim();
  return firstQuestion ? firstQuestion.slice(0, 64) : 'Neuer Chat';
};

const safeMessages = (messages: MessageType[]): MessageType[] =>
  messages.map((message) => ({
    ...message,
    fileUploads: message.fileUploads?.map((file) => ({
      type: file.type,
      name: file.name,
      mime: file.mime,
    })),
  }));

const readThreads = (flowId: string): ChatThread[] => {
  try {
    const value = localStorage.getItem(historyKey(flowId));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ChatThread =>
        !!item &&
        typeof item.id === 'string' &&
        typeof item.chatId === 'string' &&
        typeof item.title === 'string' &&
        Array.isArray(item.messages) &&
        typeof item.updatedAt === 'number',
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.warn('[Flowise] Chat history could not be read from this browser.', error);
    return [];
  }
};

const writeThreads = (flowId: string, threads: ChatThread[]) => {
  try {
    localStorage.setItem(historyKey(flowId), JSON.stringify(threads));
  } catch (error) {
    console.warn('[Flowise] Chat history could not be saved. Browser storage may be full or disabled.', error);
  }
};

const setLegacySession = (flowId: string, chatId: string, messages: MessageType[]) => {
  try {
    // Flowise's existing Bot only reads one session. Keep that API contract
    // and preserve lead-capture data while changing the selected conversation.
    const previous = getLocalStorageChatflow(flowId);
    const lead = previous?.lead;
    localStorage.setItem(
      activeChatKey(flowId),
      JSON.stringify({
        chatId,
        chatHistory: safeMessages(messages),
        ...(lead ? { lead } : {}),
      }),
    );
  } catch (error) {
    console.warn('[Flowise] Unable to activate the selected chat session.', error);
  }
};

const createSessionId = (props: ChatWorkspaceProps) => {
  const customerId = (props.chatflowConfig?.vars as { customerId?: string | number } | undefined)?.customerId;
  return customerId ? String(customerId) + '+' + uuidv4() : uuidv4();
};

const initializeWorkspace = (props: ChatWorkspaceProps): InitialWorkspace => {
  const existing = getLocalStorageChatflow(props.chatflowid);
  let threads = readThreads(props.chatflowid);
  const existingMessages = Array.isArray(existing?.chatHistory) ? (existing.chatHistory as MessageType[]) : [];
  const existingId = typeof existing?.chatId === 'string' ? existing.chatId : '';

  // Migrate the old single-chat browser history without deleting it.
  if (existingId && containsUserMessage(existingMessages)) {
    const alreadySaved = threads.find((thread) => thread.chatId === existingId);
    if (!alreadySaved) {
      threads = [
        {
          id: existingId,
          chatId: existingId,
          title: getThreadTitle(existingMessages),
          messages: safeMessages(existingMessages),
          updatedAt: Date.now(),
        },
        ...threads,
      ];
      writeThreads(props.chatflowid, threads);
    }
  }

  const selected = threads.find((thread) => thread.chatId === existingId) || (!existingId ? threads[0] : undefined);
  const activeId = selected?.id || existingId || createSessionId(props);
  if (selected) {
    setLegacySession(props.chatflowid, selected.chatId, selected.messages);
  } else if (!existingId) {
    setLegacySession(props.chatflowid, activeId, []);
  }
  return { activeId, threads };
};

const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M4 5h16M4 12h16M4 19h16" />
  </svg>
);

const PlusIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7" />
  </svg>
);

export const ChatWorkspace = (props: ChatWorkspaceProps) => {
  // Disabling history keeps the original embedding behaviour.
  if (props.historyEnabled === false) return <Bot {...props} />;

  const initial = initializeWorkspace(props);
  const [activeId, setActiveId] = createSignal(initial.activeId);
  const [threads, setThreads] = createSignal<ChatThread[]>(initial.threads);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingMessages: MessageType[] | undefined;
  let changingThread = false;

  const savePendingMessages = () => {
    if (!pendingMessages || changingThread) return;
    const nextMessages = pendingMessages;
    pendingMessages = undefined;
    if (!containsUserMessage(nextMessages)) return;

    const current = threads();
    const previous = current.find((thread) => thread.id === activeId());
    const legacy = getLocalStorageChatflow(props.chatflowid);
    const currentChatId = typeof legacy?.chatId === 'string' ? legacy.chatId : previous?.chatId || activeId();
    const nextThread: ChatThread = {
      id: activeId(),
      chatId: currentChatId,
      title: previous?.title || getThreadTitle(nextMessages),
      messages: safeMessages(nextMessages),
      updatedAt: Date.now(),
    };
    const next = [nextThread, ...current.filter((thread) => thread.id !== nextThread.id)].sort((a, b) => b.updatedAt - a.updatedAt);
    setThreads(next);
    writeThreads(props.chatflowid, next);
  };

  const flushMessages = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    savePendingMessages();
  };

  onCleanup(flushMessages);

  const observeMessages = (value: string | boolean | object | MessageType[]) => {
    props.observersConfig?.observeMessages?.(value);
    if (changingThread || !Array.isArray(value)) return;
    // Avoid rewriting a previously saved conversation with the Bot's temporary
    // welcome-only state before its on-mount history restoration completes.
    if (!containsUserMessage(value as MessageType[])) return;
    pendingMessages = value as MessageType[];
    if (!saveTimer) saveTimer = setTimeout(flushMessages, 400);
  };

  const observers: observersConfigType = {
    observeMessages,
    observeLoading: (value) => {
      setBusy(Boolean(value));
      props.observersConfig?.observeLoading?.(value);
    },
    observeUserInput: (value) => props.observersConfig?.observeUserInput?.(value),
  };

  const activateSession = (id: string, chatId: string, messages: MessageType[]) => {
    if (busy()) return;
    flushMessages();
    changingThread = true;
    setLegacySession(props.chatflowid, chatId, messages);
    setActiveId(id);
    setHistoryOpen(false);
    // The old Bot is removed synchronously by Solid's keyed Show.
    Promise.resolve().then(() => {
      changingThread = false;
    });
  };

  const newChat = () => {
    if (busy()) return;
    const id = createSessionId(props);
    activateSession(id, id, []);
  };

  const openThread = (thread: ChatThread) => {
    if (thread.id === activeId()) {
      setHistoryOpen(false);
      return;
    }
    activateSession(thread.id, thread.chatId, thread.messages);
  };

  const deleteThread = (thread: ChatThread) => {
    if (busy() || !window.confirm('Diesen Chat wirklich löschen?')) return;
    flushMessages();
    const next = threads().filter((item) => item.id !== thread.id);
    setThreads(next);
    writeThreads(props.chatflowid, next);
    if (thread.id === activeId()) {
      const target = next[0];
      if (target) activateSession(target.id, target.chatId, target.messages);
      else newChat();
    }
  };

  return (
    <div class={'flowise-history-workspace ' + (props.isFullPage ? 'flowise-history-full' : 'flowise-history-embedded') + (historyOpen() ? ' flowise-history-open' : '')}>
      <Show when={historyOpen()}>
        <aside class="flowise-history-sidebar" aria-label="Chatverläufe">
          <div class="flowise-history-sidebar-header">
            <span>Alle Chats</span>
            <button class="flowise-history-icon-button" type="button" aria-label="Chatliste schließen" title="Chatliste schließen" onClick={() => setHistoryOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <button class="flowise-history-new-button" type="button" disabled={busy()} onClick={newChat}>
            <PlusIcon />
            Neuer Chat
          </button>
          <div class="flowise-history-list">
            <Show when={threads().length > 0} fallback={<p class="flowise-history-empty">Noch keine gespeicherten Chats.</p>}>
              <For each={threads()}>
                {(thread) => (
                  <div class={'flowise-history-item ' + (thread.id === activeId() ? 'flowise-history-item-active' : '')}>
                    <button
                      class="flowise-history-item-open"
                      type="button"
                      disabled={busy()}
                      onClick={() => openThread(thread)}
                      aria-current={thread.id === activeId() ? 'page' : undefined}
                      title={thread.title}
                    >
                      <span class="flowise-history-item-title">{thread.title}</span>
                      <span class="flowise-history-item-date">{new Date(thread.updatedAt).toLocaleDateString('de-DE')}</span>
                    </button>
                    <button
                      class="flowise-history-delete"
                      type="button"
                      disabled={busy()}
                      aria-label={'Chat löschen: ' + thread.title}
                      title="Chat löschen"
                      onClick={() => deleteThread(thread)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </For>
            </Show>
          </div>
          <p class="flowise-history-note">Chats werden nur in diesem Browser gespeichert.</p>
        </aside>
      </Show>
      <section class="flowise-history-main" aria-label="Chat">
        <header
          class="flowise-history-toolbar"
          style={{
            'background-color': props.titleBackgroundColor || props.bubbleBackgroundColor || '#3B81F6',
            color: props.titleTextColor || props.bubbleTextColor || '#ffffff',
          }}
        >
          <button
            class="flowise-history-icon-button"
            type="button"
            aria-label="Alle Chats anzeigen"
            title="Alle Chats anzeigen"
            aria-expanded={historyOpen()}
            onClick={() => setHistoryOpen(!historyOpen())}
          >
            <HistoryIcon />
          </button>
          <Show when={props.titleAvatarSrc}>
            <img class="flowise-history-avatar" src={props.titleAvatarSrc} alt="" />
          </Show>
          <span class="flowise-history-heading">{props.title || 'Chat'}</span>
          <button class="flowise-history-icon-button" type="button" aria-label="Neuen Chat starten" title="Neuer Chat" disabled={busy()} onClick={newChat}>
            <PlusIcon />
          </button>
          <Show when={props.closeBot}>
            <button class="flowise-history-icon-button" type="button" aria-label="Chat schließen" title="Chat schließen" onClick={() => props.closeBot?.()}>
              <CloseIcon />
            </button>
          </Show>
        </header>
        <div class="flowise-history-bot">
          <For each={[activeId()]}>
            {() => <Bot {...props} showTitle={false} clearChatOnReload={false} observersConfig={observers} />}
          </For>
        </div>
      </section>
    </div>
  );
};
