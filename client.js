window.__ModuleLoader__.load({
  id: '@local/dsh-multi-session',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    /** Client locale namespace. */
    const NS = 'multisession'
    /** Main-panel key; must equal the sidebar icon id so the entry appears. */
    const PANEL_ID = 'multisession'
    /** Session-scoped child slot owned by this panel, one occurrence per pane. */
    const PANE_SLOT = 'multisession.pane'
    const STORAGE_KEY = 'dsh.multi-session.v1'
    /** Guard against a corrupted stored layout; the UI itself has no cap. */
    const STORED_PANE_LIMIT = 32
    /** Narrowest column that still fits a conversation; drives the column count. */
    const MIN_PANE_WIDTH = 380
    const REF_SOURCE = 'multisessionPane'

    const ZH = {
      panelLabel: '多会话',
      addPane: '添加会话格',
      pickTitle: '选择会话',
      pickSearch: '搜索标题或 ID',
      pickEmpty: '没有匹配的会话',
      pickEmptyHint: '换个关键词，或直接新建一个会话',
      pickClear: '清空该格',
      pickClose: '关闭',
      newSession: '新建会话',
      creating: '正在新建…',
      createFailed: '新建失败',
      emptyTitle: '这一格还没有会话',
      emptyHint: '新建一个会话，或选择一个已有会话并排查看',
      emptyAction: '选择会话',
      switchSession: '切换会话',
      maximize: '最大化',
      restore: '还原',
      closePane: '关闭这一格',
      running: '运行中',
      idle: '空闲',
      unavailableTitle: '会话不可用',
      unavailableHint: '它可能已被删除，或当前无法加载',
      retry: '重试',
      crashTitle: '这一格出错了',
      crashHint: '其他格子不受影响，可以重试或换一个会话',
      loading: '加载中…',
      noSession: '未选择会话',
      paneCount: '格',
    }

    const EN = {
      panelLabel: 'Multi-session',
      addPane: 'Add pane',
      pickTitle: 'Choose a session',
      pickSearch: 'Search title or ID',
      pickEmpty: 'No matching sessions',
      pickEmptyHint: 'Try another keyword, or create a new session',
      pickClear: 'Clear pane',
      pickClose: 'Close',
      newSession: 'New session',
      creating: 'Creating…',
      createFailed: 'Could not create session',
      emptyTitle: 'No session in this pane',
      emptyHint: 'Create a new session, or pick an existing one to view side by side',
      emptyAction: 'Choose session',
      switchSession: 'Switch session',
      maximize: 'Maximize',
      restore: 'Restore',
      closePane: 'Close pane',
      running: 'Running',
      idle: 'Idle',
      unavailableTitle: 'Session unavailable',
      unavailableHint: 'It may have been deleted or cannot be loaded',
      retry: 'Retry',
      crashTitle: 'This pane crashed',
      crashHint: 'Other panes are unaffected — retry or pick another session',
      loading: 'Loading…',
      noSession: 'No session',
      paneCount: 'panes',
    }

    const styles = {
      root: {
        height: '100%',
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flex: '0 0 auto',
        padding: '10px 14px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      toolbarTitle: { fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' },
      toolbarMeta: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' },
      spacer: { flex: '1 1 auto', minWidth: 8 },
      grid: {
        flex: '1 1 auto',
        minHeight: 0,
        display: 'grid',
        gap: 12,
        padding: 12,
        overflowY: 'auto',
        overflowX: 'hidden',
        alignContent: 'start',
      },
      maximizedHost: {
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        padding: 12,
        overflow: 'hidden',
      },
      pane: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-l1)',
      },
      paneHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: '0 0 auto',
        padding: '6px 8px 6px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      dot: { width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto' },
      titleButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        maxWidth: '72%',
        padding: '2px 6px',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12.5,
        cursor: 'pointer',
      },
      titleText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      iconButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        flex: '0 0 auto',
        padding: 0,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
      },
      disabled: { opacity: 0.35, cursor: 'default' },
      body: {
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      },
      conversation: {
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      },
      center: {
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
        textAlign: 'center',
      },
      emptyTitle: { fontSize: 13, fontWeight: 600 },
      emptyHint: {
        fontSize: 12,
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-tertiary)',
        maxWidth: 280,
      },
      primaryButton: {
        marginTop: 4,
        padding: '5px 12px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'var(--dsw-alias-button-elevated-fill)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
        cursor: 'pointer',
      },
      ghostButton: {
        flex: '0 0 auto',
        padding: '4px 10px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        cursor: 'pointer',
      },
      emptyActions: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 4,
      },
      errorLine: {
        maxWidth: 300,
        padding: '2px 4px',
        fontSize: 11.5,
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-error)',
      },
      picker: {
        position: 'absolute',
        top: 8,
        right: 8,
        left: 8,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100% - 16px)',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-overlay)',
      },
      backdrop: { position: 'absolute', inset: 0, zIndex: 30, background: 'transparent' },
      pickerHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: '0 0 auto',
        padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      pickerTitle: { flex: '0 0 auto', fontSize: 12, fontWeight: 600 },
      input: {
        flex: '1 1 auto',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: '5px 8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12,
        outline: 'none',
      },
      pickerList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 0,
        overflowY: 'auto',
        padding: 6,
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 8px',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12.5,
        textAlign: 'left',
        cursor: 'pointer',
      },
      rowTitle: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      rowTime: {
        flex: '0 0 auto',
        fontSize: 11,
        color: 'var(--dsw-alias-label-tertiary)',
        fontVariantNumeric: 'tabular-nums',
      },
      pickerFooter: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flex: '0 0 auto',
        padding: '6px 10px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      hint: {
        padding: '16px 10px',
        fontSize: 11.5,
        lineHeight: 1.6,
        textAlign: 'center',
        color: 'var(--dsw-alias-label-tertiary)',
      },
    }

    /* ---------------------------------------------------------------- icons */

    function Icon({ size, children }) {
      return h('svg', {
        width: size || 14,
        height: size || 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      }, children)
    }

    function IconMaximize() {
      return h(Icon, null, h('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2 }))
    }

    function IconRestore() {
      return h(Icon, null,
        h('rect', { x: 2.5, y: 5.5, width: 8, height: 8, rx: 1.5 }),
        h('path', { d: 'M5.5 5.5V4A1.5 1.5 0 0 1 7 2.5h5A1.5 1.5 0 0 1 13.5 4v5A1.5 1.5 0 0 1 12 10.5h-1.5' }))
    }

    function IconClose() {
      return h(Icon, null, h('path', { d: 'M4 4l8 8M12 4l-8 8' }))
    }

    function IconChevron() {
      return h(Icon, { size: 12 }, h('path', { d: 'M4.5 6.5L8 10l3.5-3.5' }))
    }

    function IconSplit({ size }) {
      return h(Icon, { size: size || 22 },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2 }),
        h('path', { d: 'M6.5 2.5v11M6.5 9.5h8' }))
    }

    /** Sidebar rail glyph; receives the shell's icon size and active flag. */
    function MultiSessionIcon({ size }) {
      return h(Icon, { size: size || 16 },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2 }),
        h('path', { d: 'M6.5 2.5v11M6.5 9.5h8' }))
    }

    /* -------------------------------------------------------------- storage */

    function nextPaneId() {
      return 'pane-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    }

    function normalizeLayout(value) {
      if (!value || typeof value !== 'object') return null
      if (value.version !== 1 || !Array.isArray(value.panes)) return null
      const panes = []
      const seen = new Set()
      for (const raw of value.panes.slice(0, STORED_PANE_LIMIT)) {
        if (!raw || typeof raw.id !== 'string' || raw.id === '' || seen.has(raw.id)) continue
        seen.add(raw.id)
        panes.push({
          id: raw.id,
          sessionId: typeof raw.sessionId === 'string' && raw.sessionId !== '' ? raw.sessionId : null,
        })
      }
      if (panes.length === 0) return null
      const maximizedId = typeof value.maximizedId === 'string' && seen.has(value.maximizedId)
        ? value.maximizedId
        : null
      return { panes, maximizedId }
    }

    function loadLayout() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return normalizeLayout(JSON.parse(raw))
      } catch (_unavailable) {
        return null
      }
    }

    function saveLayout(layout) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1,
          panes: layout.panes,
          maximizedId: layout.maximizedId,
        }))
      } catch (_unavailable) {
        /* Private mode or quota: the panel keeps working in memory. */
      }
    }

    function pickableSessions(snapshot) {
      const rows = []
      if (!snapshot || !Array.isArray(snapshot.ids)) return rows
      for (const id of snapshot.ids) {
        const row = snapshot.byId ? snapshot.byId[id] : undefined
        if (!row || row.blank || row.origin === 'subagent') continue
        rows.push(row)
      }
      rows.sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
      return rows
    }

    function defaultPanes(snapshot) {
      const recent = pickableSessions(snapshot).slice(0, 2)
      if (recent.length === 0) return [{ id: nextPaneId(), sessionId: null }]
      return recent.map(row => ({ id: nextPaneId(), sessionId: row.id }))
    }

    /**
     * Pick the location for a session created inside a pane: the workspace that
     * already hosts the pane's session, else the workspace of the most recent
     * session, else an explicit cwd, else the Host default. Never both keys:
     * `session.create` accepts workspaceId or cwd, not both.
     */
    function createTarget(pane, workspaces, snapshot) {
      const items = workspaces && Array.isArray(workspaces.items) ? workspaces.items : []
      const recent = pickableSessions(snapshot)[0]
      const anchors = []
      if (pane && pane.sessionId) anchors.push(pane.sessionId)
      if (recent && recent.id !== (pane ? pane.sessionId : null)) anchors.push(recent.id)
      for (const id of anchors) {
        const host = items.find(item => Array.isArray(item.sessionIds) && item.sessionIds.includes(id))
        if (host) return { workspaceId: host.workspaceId }
      }
      const bound = pane && pane.sessionId && snapshot && snapshot.byId
        ? snapshot.byId[pane.sessionId]
        : undefined
      if (bound && bound.cwd) return { cwd: bound.cwd }
      if (recent && recent.cwd) return { cwd: recent.cwd }
      return undefined
    }

    function formatTime(value) {
      const date = new Date(value || 0)
      if (Number.isNaN(date.getTime())) return ''
      const pad = n => String(n).padStart(2, '0')
      return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    function errorText(error) {
      if (!error) return ''
      if (typeof error === 'string') return error
      return error.message || String(error)
    }

    /* ------------------------------------------------------------ chrome UI */

    function IconButton({ label, onClick, disabled, children }) {
      const [hover, setHover] = useState(false)
      const style = Object.assign(
        {},
        styles.iconButton,
        hover && !disabled ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : null,
        disabled ? styles.disabled : null,
      )
      return h('button', {
        type: 'button',
        title: label,
        'aria-label': label,
        disabled: !!disabled,
        onClick: disabled ? undefined : onClick,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style,
      }, children)
    }

    function EmptyState({ t, onPick, onCreate, creating, error }) {
      return h('div', { style: styles.center },
        h('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, h(IconSplit, { size: 26 })),
        h('div', { style: styles.emptyTitle }, t('emptyTitle')),
        h('div', { style: styles.emptyHint }, t('emptyHint')),
        h('div', { style: styles.emptyActions },
          h('button', {
            type: 'button',
            style: Object.assign({}, styles.primaryButton, { marginTop: 0 }),
            disabled: !!creating,
            onClick: onCreate,
          }, creating ? t('creating') : t('newSession')),
          h('button', { type: 'button', style: styles.ghostButton, onClick: onPick }, t('emptyAction'))),
        error ? h('div', { style: styles.errorLine }, t('createFailed') + '：' + error) : null)
    }

    function UnavailableState({ t, onPick, detail }) {
      return h('div', { style: styles.center },
        h('div', { style: Object.assign({}, styles.emptyTitle, { color: 'var(--dsw-alias-label-error)' }) }, t('unavailableTitle')),
        h('div', { style: styles.emptyHint }, t('unavailableHint')),
        detail ? h('div', { style: Object.assign({}, styles.emptyHint, { opacity: 0.7, fontSize: 11 }) }, detail) : null,
        h('button', { type: 'button', style: styles.primaryButton, onClick: onPick }, t('switchSession')))
    }

    function LoadingState({ t }) {
      return h('div', { style: styles.center },
        h('div', { style: styles.emptyHint }, t('loading')))
    }

    /* -------------------------------------------------------------- picker */

    function SessionRow({ row, selected, onPick, t }) {
      const [hover, setHover] = useState(false)
      const style = Object.assign(
        {},
        styles.row,
        hover ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : null,
        selected ? { background: 'var(--dsw-alias-interactive-bg-active)' } : null,
      )
      const title = row.displayTitle || String(row.id).slice(0, 8)
      return h('button', {
        type: 'button',
        style,
        onClick: () => onPick(row.id),
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        title: row.displayTitle || String(row.id),
      },
        h('span', {
          style: Object.assign({}, styles.dot, {
            background: row.running
              ? 'var(--dsw-alias-state-success-primary)'
              : 'var(--dsw-alias-state-idle-primary)',
          }),
          title: row.running ? t('running') : t('idle'),
        }),
        h('span', { style: styles.rowTitle }, title),
        h('span', { style: styles.rowTime }, formatTime(row.updatedAt)))
    }

    function SessionPicker({ currentSessionId, useSessions, t, onPick, onClear, onCreate, creating, error, onClose }) {
      const list = useSessions(state => state)
      const [query, setQuery] = useState('')
      const rows = useMemo(() => {
        const all = pickableSessions(list)
        const current = currentSessionId && list && list.byId ? list.byId[currentSessionId] : undefined
        const merged = current && current.blank && !all.some(row => row.id === current.id)
          ? [current].concat(all)
          : all
        const needle = query.trim().toLowerCase()
        if (needle === '') return merged
        return merged.filter(row =>
          String(row.displayTitle || '').toLowerCase().includes(needle)
          || String(row.id).toLowerCase().includes(needle))
      }, [list, query, currentSessionId])

      return h(React.Fragment, null,
        h('div', { style: styles.backdrop, onClick: onClose }),
        h('div', { style: styles.picker, role: 'dialog', 'aria-label': t('pickTitle') },
          h('div', { style: styles.pickerHeader },
            h('span', { style: styles.pickerTitle }, t('pickTitle')),
            h('input', {
              style: styles.input,
              value: query,
              autoFocus: true,
              placeholder: t('pickSearch'),
              'aria-label': t('pickSearch'),
              onChange: event => setQuery(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  onClose()
                }
              },
            }),
            h(IconButton, { label: t('pickClose'), onClick: onClose }, h(IconClose))),
          h('div', { style: styles.pickerList },
            rows.length === 0
              ? h('div', { style: styles.hint }, t('pickEmpty') + '\n' + t('pickEmptyHint'))
              : rows.map(row => h(SessionRow, {
                key: row.id,
                row,
                selected: row.id === currentSessionId,
                t,
                onPick,
              }))),
          error ? h('div', { style: styles.errorLine }, t('createFailed') + '：' + error) : null,
          h('div', { style: styles.pickerFooter },
            h('span', { style: styles.toolbarMeta }, currentSessionId
              ? t('switchSession')
              : t('noSession')),
            h('span', { style: styles.spacer }),
            h('button', {
              type: 'button',
              style: Object.assign({}, styles.primaryButton, { marginTop: 0 }),
              disabled: !!creating,
              onClick: onCreate,
            }, creating ? t('creating') : t('newSession')),
            h('button', {
              type: 'button',
              style: Object.assign({}, styles.ghostButton, currentSessionId ? null : styles.disabled),
              disabled: !currentSessionId || !!creating,
              onClick: onClear,
            }, t('pickClear')))))
    }

    /* ----------------------------------------------------------- pane parts */

    function PaneHeader({ pane, maximized, canClose, useSessions, t, onPick, onToggleMax, onClose }) {
      const row = useSessions(state => (pane.sessionId ? state.byId[pane.sessionId] : undefined))
      const title = row && row.displayTitle
        ? row.displayTitle
        : pane.sessionId
          ? String(pane.sessionId).slice(0, 8)
          : t('noSession')
      const running = !!(row && row.running)
      const [hover, setHover] = useState(false)
      return h('div', { style: styles.paneHeader },
        h('span', {
          style: Object.assign({}, styles.dot, {
            background: running
              ? 'var(--dsw-alias-state-success-primary)'
              : 'var(--dsw-alias-state-idle-primary)',
          }),
          title: running ? t('running') : t('idle'),
        }),
        h('button', {
          type: 'button',
          style: Object.assign({}, styles.titleButton, hover ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : null),
          onClick: onPick,
          title: t('switchSession'),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
        },
          h('span', { style: styles.titleText }, title),
          h(IconChevron)),
        h('span', { style: styles.spacer }),
        h(IconButton, { label: maximized ? t('restore') : t('maximize'), onClick: onToggleMax },
          maximized ? h(IconRestore) : h(IconMaximize)),
        h(IconButton, { label: t('closePane'), onClick: onClose, disabled: !canClose }, h(IconClose)))
    }

    /**
     * Keep one retained Session reference alive for the lifetime of a pane.
     * The reference is re-acquired when the binding id changes and released on
     * unmount; a failed attempt is retried when the catalogue learns the id
     * (a freshly created session) or when the list settles.
     */
    function usePaneReference(pane, sessions, phase, known) {
      const current = useRef(null)
      const [reference, setReference] = useState(null)
      const [failure, setFailure] = useState(null)

      const drop = useCallback(() => {
        const held = current.current
        current.current = null
        if (held) {
          try {
            held.reference.release()
          } catch (_alreadyGone) {
            /* Releasing twice or after teardown is harmless. */
          }
        }
        return held !== null
      }, [])

      const release = useCallback(() => {
        if (drop()) setReference(null)
      }, [drop])

      useEffect(() => {
        if (!pane.sessionId) {
          if (current.current) release()
          setFailure(null)
          return
        }
        if (current.current && current.current.sessionId === pane.sessionId) return
        if (current.current) release()
        try {
          const next = sessions.retain(pane.sessionId, { source: REF_SOURCE })
          current.current = { sessionId: pane.sessionId, reference: next }
          setReference(next)
          setFailure(null)
        } catch (error) {
          setReference(null)
          setFailure(error)
        }
      }, [pane.sessionId, phase, known, sessions, release])

      useEffect(() => drop, [drop])

      return { reference, failure }
    }

    /** Session-scoped slot body: the official conversation occurrence. */
    function ConversationPane({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
      const session = useSession(value => value)
      const conversation = useConversation(value => value)
      const activeTargets = conversation && conversation.activeTargets
      const active = (activeTargets && activeTargets.size > 0)
        || (session && !session.blank && !session.awaitingFirstTurn)
        || !!(session && session.running)
      const shellPhase = active ? 'active' : session && session.promptAttempted ? 'engaging' : 'blank'
      const summaryBlank = useSessions(state => {
        const row = state.byId[sessionId]
        return row ? row.blank : undefined
      })
      const settling = shellPhase === 'blank'
        && !!session
        && session.openState === 'loading'
        && summaryBlank !== true
      const hero = shellPhase === 'blank' && !!session
        && (session.openState === 'open' || summaryBlank === true)
      const phase = settling ? 'settling' : hero ? 'hero' : 'active'
      return h('div', { style: styles.conversation },
        renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, {
          slots: { views: FixedChatConversationView },
        }))
    }

    function FixedChatConversationView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    function PaneBody({ pane, sessions, SessionProvider, renderSlot, useSessions, t, onPick, onCreate, creating, createError }) {
      const phase = useSessions(state => state.phase)
      const known = useSessions(state => (pane.sessionId ? state.byId[pane.sessionId] !== undefined : true))
      const { reference, failure } = usePaneReference(pane, sessions, phase, known)

      if (!pane.sessionId) {
        return h(EmptyState, { t, onPick, onCreate, creating, error: createError })
      }
      if (!reference) {
        if (failure && (known || phase !== 'loading')) {
          return h(UnavailableState, { t, onPick, detail: errorText(failure) })
        }
        return h(LoadingState, { t })
      }

      return h(SessionProvider, {
        session: reference,
        empty: () => (phase === 'loading' ? h(LoadingState, { t }) : h(UnavailableState, { t, onPick })),
      }, renderSlot(PANE_SLOT, {}))
    }

    class PaneBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
        this.reset = this.reset.bind(this)
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        console.error('[multi-session] pane crashed', error, info)
      }

      reset() {
        this.setState({ error: null })
      }

      render() {
        const { error } = this.state
        if (!error) return this.props.children
        return this.props.fallback(error, this.reset)
      }
    }

    function PaneCrash({ error, t, onRetry }) {
      return h('div', { style: styles.center },
        h('div', { style: Object.assign({}, styles.emptyTitle, { color: 'var(--dsw-alias-label-error)' }) }, t('crashTitle')),
        h('div', { style: styles.emptyHint }, t('crashHint')),
        h('div', { style: Object.assign({}, styles.emptyHint, { opacity: 0.7, fontSize: 11 }) }, errorText(error)),
        h('button', { type: 'button', style: styles.primaryButton, onClick: onRetry }, t('retry')))
    }

    /* ---------------------------------------------------------------- page */

    function MultiSessionPage(props) {
      const { SessionProvider, renderSlot, useSessions, useWorkspaces, sessions, t } = props
      const [layout, setLayout] = useState(loadLayout)
      const [pickingId, setPickingId] = useState(null)
      const [creatingPane, setCreatingPane] = useState(null)
      const [createFailure, setCreateFailure] = useState(null)
      const [width, setWidth] = useState(0)
      const rootRef = useRef(null)
      const phase = useSessions(state => state.phase)
      /* ui-workspace supplies this global hook; fall back rather than blank the panel. */
      const readWorkspaces = typeof useWorkspaces === 'function' ? useWorkspaces : selector => selector(null)
      const workspaces = readWorkspaces(state => state)

      // First run without a stored layout: fill with the two most recent sessions
      // once the catalogue settles, so an empty-looking first paint is never saved.
      useEffect(() => {
        if (layout !== null || phase === 'loading') return
        let snapshot = null
        try {
          snapshot = sessions.list.getSnapshot()
        } catch (_unavailable) {
          snapshot = null
        }
        setLayout({ panes: defaultPanes(snapshot), maximizedId: null })
      }, [layout, phase, sessions])

      useEffect(() => {
        if (layout === null) return
        const timer = setTimeout(() => saveLayout(layout), 200)
        return () => clearTimeout(timer)
      }, [layout])

      useEffect(() => {
        const element = rootRef.current
        if (!element || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(entries => {
          for (const entry of entries) setWidth(entry.contentRect.width)
        })
        observer.observe(element)
        return () => observer.disconnect()
      }, [])

      const maximizedId = layout ? layout.maximizedId : null
      useEffect(() => {
        if (!maximizedId) return
        const onKeyDown = event => {
          if (event.key === 'Escape') setLayout(previous => (previous ? Object.assign({}, previous, { maximizedId: null }) : previous))
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [maximizedId])

      const addPane = useCallback(() => {
        const id = nextPaneId()
        setLayout(previous => {
          if (!previous) return previous
          return Object.assign({}, previous, { panes: previous.panes.concat([{ id, sessionId: null }]) })
        })
        setPickingId(id)
      }, [])

      const closePane = useCallback(id => {
        setLayout(previous => {
          if (!previous || previous.panes.length <= 1) return previous
          return {
            panes: previous.panes.filter(pane => pane.id !== id),
            maximizedId: previous.maximizedId === id ? null : previous.maximizedId,
          }
        })
        setPickingId(current => (current === id ? null : current))
      }, [])

      const toggleMaximize = useCallback(id => {
        setLayout(previous => {
          if (!previous) return previous
          return Object.assign({}, previous, { maximizedId: previous.maximizedId === id ? null : id })
        })
      }, [])

      const assignSession = useCallback((id, sessionId) => {
        setLayout(previous => {
          if (!previous) return previous
          return Object.assign({}, previous, {
            panes: previous.panes.map(pane => (pane.id === id ? { id: pane.id, sessionId } : pane)),
          })
        })
        setPickingId(null)
      }, [])

      const clearPane = useCallback(id => { assignSession(id, null) }, [assignSession])
      const dismissPicker = useCallback(() => setPickingId(null), [])

      /** Create a fresh session for one pane and bind it there. */
      const createSession = useCallback(paneId => {
        if (creatingPane !== null) return
        const target = layout ? layout.panes.find(pane => pane.id === paneId) : null
        if (!target) return
        let snapshot = null
        try {
          snapshot = sessions.list.getSnapshot()
        } catch (_unavailable) {
          snapshot = null
        }
        const request = createTarget(target, workspaces, snapshot)
        setCreatingPane(paneId)
        setCreateFailure(null)
        Promise.resolve()
          .then(() => (request ? sessions.create(request) : sessions.create()))
          .then(sessionId => {
            setCreatingPane(null)
            if (typeof sessionId === 'string' && sessionId !== '') assignSession(paneId, sessionId)
          })
          .catch(error => {
            setCreatingPane(null)
            setCreateFailure({ paneId, message: errorText(error) })
          })
      }, [assignSession, creatingPane, layout, sessions, workspaces])

      let body = h('div', { style: styles.center }, h('div', { style: styles.emptyHint }, t('loading')))
      if (layout !== null) {
        const panes = layout.panes
        /* Columns follow the window, but never outnumber the panes: two panes in a
           three-column-wide window should fill the width, not leave a dead cell. */
        const room = width > 0 ? Math.max(1, Math.min(3, Math.floor(width / MIN_PANE_WIDTH))) : 2
        const columns = Math.max(1, Math.min(room, panes.length))
        const containerStyle = maximizedId
          ? styles.maximizedHost
          : Object.assign({}, styles.grid, {
            gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))',
            gridAutoRows: 'minmax(360px, 1fr)',
          })

        body = h(React.Fragment, null,
          h('div', { style: styles.toolbar },
            h('span', { style: styles.toolbarTitle }, t('panelLabel')),
            h('span', { style: styles.toolbarMeta }, panes.length + ' ' + t('paneCount')),
            h('span', { style: styles.spacer }),
            h('button', {
              type: 'button',
              style: styles.ghostButton,
              title: t('addPane'),
              onClick: addPane,
            }, '+ ' + t('addPane'))),
          h('div', { style: containerStyle },
            panes.map((pane, index) => {
              let paneStyle = Object.assign({}, styles.pane)
              if (maximizedId) {
                if (maximizedId === pane.id) {
                  paneStyle = Object.assign(paneStyle, { flex: '1 1 auto' })
                } else {
                  paneStyle = Object.assign(paneStyle, { display: 'none' })
                }
              } else if (columns > 1 && panes.length % columns === 1 && index === panes.length - 1) {
                /* A lone last row reads better than a half-empty cell. */
                paneStyle = Object.assign(paneStyle, { gridColumn: '1 / -1' })
              }
              const picking = pickingId === pane.id
              return h('div', { key: pane.id, style: paneStyle },
                h(PaneHeader, {
                  pane,
                  maximized: maximizedId === pane.id,
                  canClose: panes.length > 1,
                  useSessions,
                  t,
                  onPick: () => setPickingId(picking ? null : pane.id),
                  onToggleMax: () => toggleMaximize(pane.id),
                  onClose: () => closePane(pane.id),
                }),
                h('div', { style: styles.body },
                  h(PaneBoundary, {
                    fallback: (error, retry) => h(PaneCrash, { error, t, onRetry: retry }),
                  }, h(PaneBody, {
                    pane,
                    sessions,
                    SessionProvider,
                    renderSlot,
                    useSessions,
                    t,
                    onPick: () => setPickingId(pane.id),
                    onCreate: () => createSession(pane.id),
                    creating: creatingPane === pane.id,
                    createError: createFailure && createFailure.paneId === pane.id ? createFailure.message : null,
                  })),
                  picking ? h(SessionPicker, {
                    currentSessionId: pane.sessionId,
                    useSessions,
                    t,
                    onPick: sessionId => {
                      setCreateFailure(null)
                      assignSession(pane.id, sessionId)
                    },
                    onClear: () => {
                      setCreateFailure(null)
                      clearPane(pane.id)
                    },
                    onCreate: () => createSession(pane.id),
                    creating: creatingPane === pane.id,
                    error: createFailure && createFailure.paneId === pane.id ? createFailure.message : null,
                    onClose: dismissPicker,
                  }) : null))
            })))
      }

      return h('div', { ref: rootRef, style: styles.root }, body)
    }

    /* --------------------------------------------------------------- apply */

    const inject = ['slots', 'locale', 'sessions']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'multi-session: dictionaries')
      const t = ctx.locale.bind(NS)
      const sessions = ctx.sessions

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ sessions }),
        children: { [PANE_SLOT]: { kind: 'single', scope: 'session' } },
      }, MultiSessionPage))

      ctx.slots.inject(PANE_SLOT, () => ctx.slots.register({
        name: PANE_SLOT,
        locale: NS,
      }, ConversationPane))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 30,
        locale: NS,
        label: () => t('panelLabel'),
      }, MultiSessionIcon))
    }

    return { inject, apply }
  },
})
