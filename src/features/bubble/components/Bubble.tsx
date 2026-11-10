import { createSignal, Show, splitProps, onCleanup, createEffect, onMount } from 'solid-js';
import styles from '../../../assets/index.css';
import { BubbleButton } from './BubbleButton';
import { BubbleParams } from '../types';
import { BotProps } from '../../../components/Bot';
import { ChatWorkspace } from '@/components/ChatWorkspace';
import Tooltip from './Tooltip';
import { getBubbleButtonSize, resolveDialogContainer } from '@/utils';
import DOMPurify from 'dompurify';

const defaultButtonColor = '#3B81F6';
const defaultIconColor = 'white';

export type BubbleProps = BotProps & BubbleParams;

export const Bubble = (props: BubbleProps) => {
  const [bubbleProps] = splitProps(props, ['theme']);
  const [bubbleContainerRef, setBubbleContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const hasWindow = typeof window !== 'undefined';

  const [isBotOpened, setIsBotOpened] = createSignal(false);
  const [isBotStarted, setIsBotStarted] = createSignal(false);
  const [viewport, setViewport] = createSignal({
    height: hasWindow ? window.innerHeight : 0,
    width: hasWindow ? window.innerWidth : 0,
  });
  const [buttonPosition, setButtonPosition] = createSignal({
    bottom: bubbleProps.theme?.button?.bottom ?? 20,
    right: bubbleProps.theme?.button?.right ?? 20,
  });

  const openBot = () => {
    if (!isBotStarted()) setIsBotStarted(true);
    setIsBotOpened(true);
  };

  const closeBot = () => {
    setIsBotOpened(false);
  };

  const toggleBot = () => {
    isBotOpened() ? closeBot() : openBot();
  };

  onMount(() => {
    const handleResize = () => setViewport({ height: window.innerHeight, width: window.innerWidth });
    window.addEventListener('resize', handleResize);
    onCleanup(() => window.removeEventListener('resize', handleResize));
  });

  onCleanup(() => {
    setIsBotStarted(false);
  });

  const buttonSize = getBubbleButtonSize(props.theme?.button?.size); // Default to 48px if size is not provided
  const buttonBottom = props.theme?.button?.bottom ?? 20;
  const chatWindowBottom = buttonBottom + buttonSize + 10; // Adjust the offset here for slight shift

  const getChatWindowHeight = () => {
    const rawHeight = bubbleProps.theme?.chatWindow?.height;
    if (rawHeight === undefined) return `min(calc(100dvh - ${chatWindowBottom + 16}px), calc(100% - 150px))`;
    if (typeof rawHeight === 'string') return rawHeight;
    return `min(${rawHeight}px, calc(100dvh - ${chatWindowBottom + 16}px))`;
  };

  const getChatWindowMaxHeight = () => {
    return `calc(100dvh - ${chatWindowBottom + 16}px)`;
  };

  const getChatWindowWidth = () => {
    const rawWidth = bubbleProps.theme?.chatWindow?.width;
    if (rawWidth === undefined) return undefined;
    if (typeof rawWidth === 'string') return rawWidth;
    return `${rawWidth}px`;
  };

  const hasCustomChatWindowWidth = () => {
    return bubbleProps.theme?.chatWindow?.width !== undefined;
  };

  const getChatWindowWidthForPositioning = () => {
    const rawWidth = bubbleProps.theme?.chatWindow?.width;
    if (typeof rawWidth === 'number') return rawWidth;
    if (typeof rawWidth === 'string') {
      const pxMatch = rawWidth.trim().match(/^(\d+(?:\.\d+)?)px$/i);
      if (pxMatch) return Number(pxMatch[1]);
    }
    return 410;
  };

  // Add viewport meta tag dynamically
  createEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, interactive-widget=resizes-content';
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  });

  const showTooltip = bubbleProps.theme?.tooltip?.showTooltip ?? false;

  return (
    <>
      <Show when={props.theme?.customCSS}>
        <style>{props.theme?.customCSS}</style>
      </Show>
      <style>{styles}</style>
      <Tooltip
        showTooltip={showTooltip && !isBotOpened()}
        position={buttonPosition()}
        buttonSize={buttonSize}
        tooltipMessage={bubbleProps.theme?.tooltip?.tooltipMessage}
        tooltipBackgroundColor={bubbleProps.theme?.tooltip?.tooltipBackgroundColor}
        tooltipTextColor={bubbleProps.theme?.tooltip?.tooltipTextColor}
        tooltipFontSize={bubbleProps.theme?.tooltip?.tooltipFontSize} // Set the tooltip font size
      />
      <BubbleButton
        {...bubbleProps.theme?.button}
        toggleBot={toggleBot}
        isBotOpened={isBotOpened()}
        setButtonPosition={setButtonPosition}
        dragAndDrop={bubbleProps.theme?.button?.dragAndDrop ?? false}
        autoOpen={bubbleProps.theme?.button?.autoWindowOpen?.autoOpen ?? false}
        openDelay={bubbleProps.theme?.button?.autoWindowOpen?.openDelay}
        autoOpenOnMobile={bubbleProps.theme?.button?.autoWindowOpen?.autoOpenOnMobile ?? false}
      />
      <div
        ref={(el) => setBubbleContainerRef(el)}
        part="bot"
        style={{
          display: 'flex',
          'flex-direction': 'column',
          overflow: 'hidden',
          height: viewport().width <= 640 ? '100dvh' : getChatWindowHeight(),
          'max-height': viewport().width <= 640 ? '100dvh' : getChatWindowMaxHeight(),
          width: viewport().width <= 640 ? '100vw' : getChatWindowWidth(),
          transition: 'transform 200ms cubic-bezier(0, 1.2, 1, 1), opacity 150ms ease-out',
          'transform-origin': 'bottom right',
          transform: isBotOpened() ? 'scale3d(1, 1, 1)' : 'scale3d(0, 0, 1)',
          'box-shadow': 'rgb(0 0 0 / 16%) 0px 5px 40px',
          'background-color': bubbleProps.theme?.chatWindow?.backgroundColor || '#ffffff',
          'background-image': bubbleProps.theme?.chatWindow?.backgroundImage ? `url(${bubbleProps.theme?.chatWindow?.backgroundImage})` : 'none',
          'background-size': 'cover',
          'background-position': 'center',
          'background-repeat': 'no-repeat',
          'z-index': 42424242,
          bottom: viewport().width <= 640 ? '0px' : `${Math.min(buttonPosition().bottom + buttonSize + 10, viewport().height - chatWindowBottom)}px`,
          right: viewport().width <= 640 ? '0px' : `${Math.max(0, Math.min(buttonPosition().right, viewport().width - getChatWindowWidthForPositioning() - 10))}px`,
        }}
        class={
          `fixed sm:right-5 rounded-lg ${hasCustomChatWindowWidth() ? '' : 'w-full sm:w-[400px]'}` +
          (isBotOpened() ? ' opacity-1' : ' opacity-0 pointer-events-none') +
          ` bottom-${chatWindowBottom}px`
        }
      >
        <Show when={isBotStarted()}>
          <Show when={bubbleProps.theme?.chatWindow?.headerHtml}>
            <div innerHTML={DOMPurify.sanitize(bubbleProps.theme?.chatWindow?.headerHtml ?? '')} />
          </Show>
          <div class="relative flex-1 min-h-0">
            <ChatWorkspace
              backgroundColor={bubbleProps.theme?.chatWindow?.backgroundColor}
              formBackgroundColor={bubbleProps.theme?.form?.backgroundColor}
              formTextColor={bubbleProps.theme?.form?.textColor}
              badgeBackgroundColor={bubbleProps.theme?.chatWindow?.backgroundColor}
              bubbleBackgroundColor={bubbleProps.theme?.button?.backgroundColor ?? defaultButtonColor}
              bubbleTextColor={bubbleProps.theme?.button?.iconColor ?? defaultIconColor}
              showTitle={bubbleProps.theme?.chatWindow?.showTitle}
              showAgentMessages={bubbleProps.theme?.chatWindow?.showAgentMessages}
              title={bubbleProps.theme?.chatWindow?.title}
              titleAvatarSrc={bubbleProps.theme?.chatWindow?.titleAvatarSrc}
              titleTextColor={bubbleProps.theme?.chatWindow?.titleTextColor}
              titleBackgroundColor={bubbleProps.theme?.chatWindow?.titleBackgroundColor}
              welcomeMessage={bubbleProps.theme?.chatWindow?.welcomeMessage}
              errorMessage={bubbleProps.theme?.chatWindow?.errorMessage}
              poweredByTextColor={bubbleProps.theme?.chatWindow?.poweredByTextColor}
              textInput={bubbleProps.theme?.chatWindow?.textInput}
              botMessage={bubbleProps.theme?.chatWindow?.botMessage}
              userMessage={bubbleProps.theme?.chatWindow?.userMessage}
              feedback={bubbleProps.theme?.chatWindow?.feedback}
              fontSize={bubbleProps.theme?.chatWindow?.fontSize}
              footer={bubbleProps.theme?.chatWindow?.footer}
              sourceDocsTitle={bubbleProps.theme?.chatWindow?.sourceDocsTitle}
              starterPrompts={bubbleProps.theme?.chatWindow?.starterPrompts}
              starterPromptFontSize={bubbleProps.theme?.chatWindow?.starterPromptFontSize}
              chatflowid={props.chatflowid}
              chatflowConfig={props.chatflowConfig}
              apiHost={props.apiHost}
              onRequest={props.onRequest}
              observersConfig={props.observersConfig}
              clearChatOnReload={bubbleProps.theme?.chatWindow?.clearChatOnReload}
              disclaimer={bubbleProps.theme?.disclaimer}
              dateTimeToggle={bubbleProps.theme?.chatWindow?.dateTimeToggle}
              renderHTML={props.theme?.chatWindow?.renderHTML}
              hasCustomHeader={!!bubbleProps.theme?.chatWindow?.headerHtml}
              closeBot={closeBot}
              dialogContainer={resolveDialogContainer(props.dialogContainer) ?? bubbleContainerRef()}
            />
          </div>
        </Show>
      </div>
    </>
  );
};
