// apps/game-client/src/components/ChatPane.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../styles/ChatPane.module.scss';
import { useChatPane } from '../hooks/useChatPane';
import {
  KNOWN_CHAT_SUBTYPES,
  type ChatSettings,
  type ChatSubtype,
  getChatSettings,
  subscribeChatSettings,
  updateChatSettings,
} from '../features/chat/chat-settings-store';

type PaneId = ChatSubtype | 'all';

type ChatPaneViewProps = {
  paneId: PaneId;
  visible: boolean;
};

const ChatPaneView: React.FC<ChatPaneViewProps> = ({ paneId, visible }) => {
  const subtype = paneId === 'all' ? undefined : (paneId as ChatSubtype);
  const { messages, scrollRef, showJump, handleScroll, handleJumpToLive } = useChatPane(subtype);

  return (
    <div className={`${styles.chatPaneShell} ${visible ? styles.chatPaneVisible : styles.chatPaneHidden}`}>
      <div ref={scrollRef} className={styles.chatScroll} onScroll={handleScroll}>
        {messages.map((msg) => (
          <div key={msg.id} className={styles.chatRow}>
            <div className={styles.chatBubble} dangerouslySetInnerHTML={{ __html: msg.html }} />
          </div>
        ))}

        {messages.length === 0 && <div className={styles.chatEmpty}>No chat yet.</div>}
      </div>

      {showJump && (
        <button type="button" className={styles.chatJumpToLive} onClick={handleJumpToLive}>
          Jump to live
        </button>
      )}
    </div>
  );
};

export const ChatPane: React.FC = () => {
  const [settings, setSettings] = useState<ChatSettings>(getChatSettings());
  const [menuOpen, setMenuOpen] = useState(false);

  // Used to anchor the menu position
  const gearButtonRef = useRef<HTMLButtonElement | null>(null);

  // Menu positioning in viewport coords (fixed)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; maxHeight: number } | null>(
    null,
  );

  const [activePane, setActivePane] = useState<PaneId>('all');

  useEffect(() => subscribeChatSettings(setSettings), []);

  const enabledSubtypeList = useMemo(() => {
    return KNOWN_CHAT_SUBTYPES.filter((s) => settings.enabledPanes[s]);
  }, [settings.enabledPanes]);

  const panes: { id: PaneId; title: string }[] = useMemo(() => {
    // Always mount "all" pane. Pills are only shown when enableChatPanes is true.
    if (!settings.enableChatPanes) return [{ id: 'all', title: 'All' }];

    return [
      { id: 'all', title: 'All' },
      ...enabledSubtypeList.map((s) => ({ id: s as PaneId, title: s.toUpperCase() })),
    ];
  }, [settings.enableChatPanes, enabledSubtypeList]);

  // If panes are disabled or active pane disappears, fall back to all
  useEffect(() => {
    if (!settings.enableChatPanes) {
      if (activePane !== 'all') setActivePane('all');
      return;
    }

    if (activePane === 'all') return;
    if (!enabledSubtypeList.includes(activePane as ChatSubtype)) setActivePane('all');
  }, [settings.enableChatPanes, enabledSubtypeList, activePane]);

  const toggleStrict = () => updateChatSettings({ strictChatFormat: !settings.strictChatFormat });
  const togglePanes = () => updateChatSettings({ enableChatPanes: !settings.enableChatPanes });

  const toggleSubtype = (subtype: ChatSubtype) => {
    updateChatSettings({
      enabledPanes: { [subtype]: !settings.enabledPanes[subtype] } as any,
    });
  };

  const computeMenuPos = () => {
    const btn = gearButtonRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();

    const viewportH =
      (window.visualViewport && Math.round(window.visualViewport.height)) || Math.round(window.innerHeight);

    const viewportW =
      (window.visualViewport && Math.round(window.visualViewport.width)) || Math.round(window.innerWidth);

    const margin = 8;
    const gap = 6;

    const idealMenuHeight = 340;

    const spaceBelow = viewportH - r.bottom - margin - gap;
    const spaceAbove = r.top - margin - gap;

    const placeBelow = spaceBelow >= Math.min(idealMenuHeight, 180) || spaceBelow >= spaceAbove;

    let top: number;
    let maxHeight: number;

    if (placeBelow) {
      top = Math.round(r.bottom + gap);
      maxHeight = Math.max(120, Math.floor(spaceBelow));
    } else {
      maxHeight = Math.max(120, Math.floor(spaceAbove));
      top = Math.round(r.top - gap - maxHeight);
    }

    const right = Math.max(margin, Math.round(viewportW - r.right));

    setMenuPos({ top, right, maxHeight });
  };

  const openMenu = () => {
    computeMenuPos();
    setMenuOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  // Keep menu position correct on resize/scroll while open
  useEffect(() => {
    if (!menuOpen) return;

    const onUpdate = () => computeMenuPos();

    window.addEventListener('resize', onUpdate);
    window.addEventListener('scroll', onUpdate, true);

    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', onUpdate);

    return () => {
      window.removeEventListener('resize', onUpdate);
      window.removeEventListener('scroll', onUpdate, true);
      if (vv) vv.removeEventListener('resize', onUpdate);
    };
  }, [menuOpen]);

  return (
    <div className={styles.chatRoot}>
      {/* Top strip: pills + gear */}
      <div className={styles.chatTopBar}>
        {settings.enableChatPanes && (
          <div className={styles.chatPills} role="tablist" aria-label="Chat panes">
            {panes.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={activePane === p.id}
                className={`${styles.chatPill} ${activePane === p.id ? styles.chatPillActive : ''}`}
                onClick={() => setActivePane(p.id)}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        <button
          ref={gearButtonRef}
          type="button"
          className={styles.chatGearButton}
          aria-label="Chat settings"
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
        >
          ⚙
        </button>
      </div>

      {/* Body: keep panes mounted (independent scroll/jump), only one visible */}
      <div className={styles.chatBody}>
        {panes.map((p) => (
          <ChatPaneView key={p.id} paneId={p.id} visible={activePane === p.id} />
        ))}
      </div>

      {/* Overlay + menu (viewport-safe; flips above if needed) */}
      {menuOpen && (
        <div
          className={styles.chatMenuOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeMenu();
          }}
        >
          <div
            className={styles.chatMenu}
            style={
              menuPos
                ? ({
                    top: `${menuPos.top}px`,
                    right: `${menuPos.right}px`,
                    maxHeight: `${menuPos.maxHeight}px`,
                  } as React.CSSProperties)
                : undefined
            }
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <label className={styles.chatMenuRow}>
              <input type="checkbox" checked={settings.strictChatFormat} onChange={toggleStrict} />
              <span>Strict Chat Format</span>
            </label>

            <label className={styles.chatMenuRow}>
              <input type="checkbox" checked={settings.enableChatPanes} onChange={togglePanes} />
              <span>Enable Chat Panes</span>
            </label>

            <div className={styles.chatMenuDivider} />

            <div className={styles.chatMenuSectionTitle}>Panes</div>
            {KNOWN_CHAT_SUBTYPES.map((s) => (
              <label key={s} className={styles.chatMenuRow}>
                <input
                  type="checkbox"
                  checked={settings.enabledPanes[s]}
                  onChange={() => toggleSubtype(s)}
                  disabled={!settings.enableChatPanes}
                />
                <span>Enable {s}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPane;
