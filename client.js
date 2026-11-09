window.__ModuleLoader__.load({
  id: '@local/dsh-multi-session',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    /** Client locale namespace. */
    const NS = 'multisession'
    /** Shown in the toolbar so a stale client bundle is obvious at a glance. */
    const VERSION = '0.8.0'
    /** Main-panel key; must equal the sidebar icon id so the entry appears. */
    const PANEL_ID = 'multisession'
    /** Session-scoped child slot owned by this panel, one occurrence per pane. */
    const PANE_SLOT = 'multisession.pane'
    const STORAGE_KEY = 'dsh.multi-session.v1'
    /** Guard against a corrupted stored layout; the UI itself has no cap. */
    const STORED_PANE_LIMIT = 32
    /** Thickness of the draggable border between two tiles, in CSS pixels. */
    const SPLITTER = 6
    /** Smallest tile the user can drag down to, in CSS pixels. */
    const MIN_PANE_W = 200
    const MIN_PANE_H = 140
    /** Breathing room around the tiled area. */
    const PAD = 6
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
      minimize: '最小化',
      restore: '还原',
      minimizedBar: '已收起',
      allMinimized: '所有格子都收起了，点上面的标题展开',
      closePane: '关闭这一格',
      running: '运行中',
      idle: '空闲',
      unavailableTitle: '会话不可用',
      unavailableHint: '它可能已被删除，或当前无法加载',
      retry: '重试',
      crashTitle: '这一格出错了',
      crashHint: '其他格子不受影响，可以重试或换一个会话',
      autoRecovering: '这一格刚出了问题，正在自动重建…',
      viewUnavailable: '当前版本无法嵌入对话视图',
      viewUnavailableHint: 'DSH 的对话视图接口可能变了；其他格子与布局仍然可用',
      panelCrashTitle: '多会话面板出错了',
      panelCrashHint: '重置布局通常可以恢复；会话本身不会受影响',
      resetLayout: '重置布局',
      loading: '加载中…',
      noSession: '未选择会话',
      paneCount: '格',
      autoArrange: '均分',
      dragHint: '拖分隔条调整相邻格子的大小',
      chooseWorkspace: '选择工作区',
      workspaceHint: '新会话会在这个工作区里创建，并在当前格子里打开，不会跳走',
      workspaceDefault: '默认位置',
      workspaceLoading: '正在加载工作区…',
      workspaceEmpty: '还没有工作区，先用默认位置新建',
      cancel: '取消',
      immersive: '沉浸全屏',
      exitImmersive: '退出全屏',
      immersiveHint: '把多会话铺满整个窗口，盖住左右两栏；按 Esc 也能退出',
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
      minimize: 'Minimize',
      restore: 'Restore',
      minimizedBar: 'Collapsed',
      allMinimized: 'All panes are collapsed — pick a title above to expand it',
      closePane: 'Close pane',
      running: 'Running',
      idle: 'Idle',
      unavailableTitle: 'Session unavailable',
      unavailableHint: 'It may have been deleted or cannot be loaded',
      retry: 'Retry',
      crashTitle: 'This pane crashed',
      crashHint: 'Other panes are unaffected — retry or pick another session',
      autoRecovering: 'This pane hit a problem and is rebuilding itself…',
      viewUnavailable: 'This DSH version cannot embed a conversation view',
      viewUnavailableHint: 'The conversation view contract may have changed; other panes and the layout still work',
      panelCrashTitle: 'The multi-session panel crashed',
      panelCrashHint: 'Resetting the layout usually recovers it; your sessions are untouched',
      resetLayout: 'Reset layout',
      loading: 'Loading…',
      noSession: 'No session',
      paneCount: 'panes',
      autoArrange: 'Even out',
      dragHint: 'Drag a divider to resize the tiles on both sides',
      chooseWorkspace: 'Choose a workspace',
      workspaceHint: 'The new session is created there and opens in this pane — the page stays put',
      workspaceDefault: 'Default location',
      workspaceLoading: 'Loading workspaces…',
      workspaceEmpty: 'No workspaces yet — create with the default location',
      cancel: 'Cancel',
      immersive: 'Immersive',
      exitImmersive: 'Exit immersive',
      immersiveHint: 'Cover the whole window with the multi-session panel; Esc also exits',
    }

    const styles = {
      root: {
        position: 'relative',
        height: '100%',
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      },
      /* Immersive: the panel leaves the grid and covers the whole window. */
      immersive: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 60,
        paddingTop: 'calc(var(--dsh-windows-titlebar-height, 0px) + 2px)',
        WebkitAppRegion: 'no-drag',
        boxShadow: '0 0 0 1px var(--dsw-alias-border-l2)',
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: '0 0 auto',
        padding: '6px 8px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      toolbarTitle: { fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' },
      toolbarMeta: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)' },
      spacer: { flex: '1 1 auto', minWidth: 8 },
      host: {
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        padding: PAD,
        boxSizing: 'border-box',
        overflow: 'hidden',
      },
      maximizedHost: {
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        padding: PAD,
        boxSizing: 'border-box',
        overflow: 'hidden',
      },
      /* Rows share the height by weight; the panes inside a row share the width. */
      tileRow: {
        display: 'flex',
        flexDirection: 'row',
        flexBasis: 0,
        minHeight: 0,
        minWidth: 0,
      },
      splitterH: {
        flex: '0 0 auto',
        height: SPLITTER,
        cursor: 'row-resize',
        touchAction: 'none',
        borderRadius: 3,
        background: 'var(--dsw-alias-border-l1)',
        opacity: 0.6,
      },
      splitterV: {
        flex: '0 0 auto',
        width: SPLITTER,
        cursor: 'col-resize',
        touchAction: 'none',
        borderRadius: 3,
        background: 'var(--dsw-alias-border-l1)',
        opacity: 0.6,
      },
      pane: {
        position: 'relative',
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-l1)',
      },
      paneHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flex: '0 0 auto',
        padding: '3px 5px 3px 8px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      minimizedBar: {
        flex: '0 0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px 6px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: 260,
        padding: '3px 4px 3px 8px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-l1)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        cursor: 'pointer',
      },
      chipTitle: {
        minWidth: 0,
        maxWidth: 170,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
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
      iconGhost: {
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 22,
        padding: 0,
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
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
      dialogBackdrop: {
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        background: 'rgba(0, 0, 0, 0.28)',
      },
      dialogCard: {
        display: 'flex',
        flexDirection: 'column',
        width: 'min(440px, 100%)',
        maxHeight: '100%',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-overlay)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.28)',
      },
      dialogBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 0,
        overflowY: 'auto',
        padding: 6,
      },
      optionText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' },
      optionMeta: {
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 11,
        color: 'var(--dsw-alias-label-tertiary)',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
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

    function IconMinimize() {
      return h(Icon, null, h('path', { d: 'M3.5 10.5h9' }))
    }

    function IconExpand() {
      return h(Icon, null, h('path', {
        d: 'M6.5 2.5H2.5V6.5M9.5 2.5h4v4M13.5 9.5v4h-4M6.5 13.5h-4v-4',
      }))
    }

    function IconCollapse() {
      return h(Icon, null, h('path', {
        d: 'M2.5 6.5h4v-4M13.5 6.5h-4v-4M10 13.5v-4h4M6 13.5v-4H2.5',
      }))
    }

    function IconClose() {      return h(Icon, null, h('path', { d: 'M4 4l8 8M12 4l-8 8' }))
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

    /** Two panes per row; an odd count leaves the first row on its own. */
    function defaultRows(ids) {
      const rows = []
      let index = 0
      if (ids.length % 2 === 1) {
        rows.push([ids[0]])
        index = 1
      }
      for (; index < ids.length; index += 2) rows.push(ids.slice(index, index + 2))
      return rows
    }

    function positive(value, fallback) {
      return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback
    }

    function makeLayout(panes, maximizedId, immersive) {
      const ids = panes.map(pane => pane.id)
      const rows = defaultRows(ids)
      const colWeights = {}
      for (const id of ids) colWeights[id] = 1
      return {
        panes,
        rows,
        rowWeights: rows.map(() => 1),
        colWeights,
        maximizedId: maximizedId || null,
        immersive: immersive === true,
      }
    }

    /** Keep only known pane ids, and give every pane a row even if storage lost it. */
    function normalizeRows(raw, order) {
      const valid = new Set(order)
      const used = new Set()
      const rows = []
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (!Array.isArray(entry)) continue
          let chunk = []
          for (const id of entry) {
            if (typeof id !== 'string' || !valid.has(id) || used.has(id)) continue
            used.add(id)
            chunk.push(id)
            if (chunk.length === 2) {
              rows.push(chunk)
              chunk = []
            }
          }
          if (chunk.length > 0) rows.push(chunk)
        }
      }
      const missing = order.filter(id => !used.has(id))
      for (const row of defaultRows(missing)) rows.push(row)
      return rows.length > 0 ? rows : defaultRows(order)
    }

    function normalizeLayout(value) {
      if (!value || typeof value !== 'object') return null
      if (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5) return null
      if (!Array.isArray(value.panes)) return null
      const panes = []
      const seen = new Set()
      for (const raw of value.panes.slice(0, STORED_PANE_LIMIT)) {
        if (!raw || typeof raw.id !== 'string' || raw.id === '' || seen.has(raw.id)) continue
        seen.add(raw.id)
        panes.push({
          id: raw.id,
          sessionId: typeof raw.sessionId === 'string' && raw.sessionId !== '' ? raw.sessionId : null,
          minimized: raw.minimized === true,
        })
      }
      if (panes.length === 0) return null
      const order = panes.map(pane => pane.id)
      const rows = normalizeRows(value.rows, order)
      const storedRowWeights = Array.isArray(value.rowWeights) ? value.rowWeights : []
      const rowWeights = rows.map((row, index) => positive(storedRowWeights[index], 1))
      const storedColWeights = value.colWeights && typeof value.colWeights === 'object' ? value.colWeights : {}
      const colWeights = {}
      for (const id of order) colWeights[id] = positive(storedColWeights[id], 1)
      const maximizedId = typeof value.maximizedId === 'string' && seen.has(value.maximizedId)
        ? value.maximizedId
        : null
      return {
        panes,
        rows,
        rowWeights,
        colWeights,
        /* A collapsed pane cannot stay maximised: it has no cell to cover. */
        maximizedId: maximizedId && !panes.some(pane => pane.id === maximizedId && pane.minimized) ? maximizedId : null,
        immersive: value.immersive === true,
      }
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
          version: 5,
          panes: layout.panes,
          rows: layout.rows,
          rowWeights: layout.rowWeights,
          colWeights: layout.colWeights,
          maximizedId: layout.maximizedId,
          immersive: layout.immersive === true,
        }))
      } catch (_unavailable) {
        /* Private mode or quota: the panel keeps working in memory. */
      }
    }

    /**
     * The rows that actually render: collapsed panes keep their slot in `rows`
     * (so expanding restores the position) but do not take grid space.
     */
    function visibleGrid(layout) {
      const byId = {}
      for (const pane of layout.panes) byId[pane.id] = pane
      const grid = []
      layout.rows.forEach((row, index) => {
        const ids = row.filter(id => byId[id] && !byId[id].minimized)
        if (ids.length > 0) grid.push({ index, ids })
      })
      return grid
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

    /* ------------------------------------------------------------ geometry */

    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value
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

    function UnavailableState({ t, onPick, onRetry, detail }) {
      return h('div', { style: styles.center },
        h('div', { style: Object.assign({}, styles.emptyTitle, { color: 'var(--dsw-alias-label-error)' }) }, t('unavailableTitle')),
        h('div', { style: styles.emptyHint }, t('unavailableHint')),
        detail ? h('div', { style: Object.assign({}, styles.emptyHint, { opacity: 0.7, fontSize: 11 }) }, detail) : null,
        h('div', { style: styles.emptyActions },
          onRetry ? h('button', {
            type: 'button',
            style: Object.assign({}, styles.primaryButton, { marginTop: 0 }),
            onClick: onRetry,
          }, t('retry')) : null,
          h('button', { type: 'button', style: styles.ghostButton, onClick: onPick }, t('switchSession'))))
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

    /**
     * Workspace step for "new session". The Host's hero picker goes through
     * `uiWorkspace.openWorkspace`, which reveals the new session in the main
     * panel and therefore leaves the multi-session page. Creating straight
     * through `sessions.create` keeps the new session in its pane instead.
     */
    function WorkspacePicker({ t, workspaces, busy, onPick, onCancel }) {
      const items = workspaces && Array.isArray(workspaces.items) ? workspaces.items.slice() : []
      const ready = !!(workspaces && workspaces.phase === 'ready')
      return h('div', { style: styles.dialogBackdrop, onClick: onCancel },
        h('div', {
          style: styles.dialogCard,
          role: 'dialog',
          'aria-label': t('chooseWorkspace'),
          onClick: event => event.stopPropagation(),
        },
          h('div', { style: styles.pickerHeader },
            h('span', { style: styles.pickerTitle }, t('chooseWorkspace')),
            h('span', { style: styles.spacer }),
            h(IconButton, { label: t('cancel'), onClick: onCancel }, h(IconClose))),
          h('div', { style: styles.hint }, t('workspaceHint')),
          h('div', { style: styles.dialogBody },
            !ready
              ? h('div', { style: styles.hint }, t('workspaceLoading'))
              : items.length === 0
                ? h('div', { style: styles.hint }, t('workspaceEmpty'))
                : items.map(item => h('button', {
                  key: item.workspaceId,
                  type: 'button',
                  'data-workspace-id': item.workspaceId,
                  disabled: !!busy,
                  style: styles.row,
                  onClick: () => onPick(item.workspaceId),
                },
                  h('span', { style: styles.optionText },
                    h('span', { style: styles.rowTitle }, item.title || item.path),
                    h('span', { style: styles.optionMeta },
                      item.path + ' · ' + (Array.isArray(item.sessionIds) ? item.sessionIds.length : 0) + ' ' + t('paneCount')))))),
          h('div', { style: styles.pickerFooter },
            h('span', { style: styles.toolbarMeta }, ready ? '' : t('workspaceLoading')),
            h('span', { style: styles.spacer }),
            h('button', { type: 'button', style: styles.ghostButton, disabled: !!busy, onClick: onCancel }, t('cancel')),
            ready && items.length === 0
              ? h('button', {
                type: 'button',
                style: Object.assign({}, styles.primaryButton, { marginTop: 0 }),
                disabled: !!busy,
                onClick: () => onPick(null),
              }, t('workspaceDefault'))
              : null)))
    }

    /* ----------------------------------------------------------- pane parts */

    function PaneHeader({ pane, maximized, canClose, useSessions, t, onPick, onToggleMax, onMinimize, onClose }) {
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
        h(IconButton, { label: t('minimize'), onClick: onMinimize }, h(IconMinimize)),
        h(IconButton, { label: maximized ? t('restore') : t('maximize'), onClick: onToggleMax },
          maximized ? h(IconRestore) : h(IconMaximize)),
        h(IconButton, { label: t('closePane'), onClick: onClose, disabled: !canClose }, h(IconClose)))
    }

    /**
     * A collapsed pane shrinks to a chip in the strip above the grid; the title
     * stays visible there and clicking it brings the pane back.
     */
    function MinimizedChip({ pane, useSessions, t, canClose, onRestore, onClose }) {
      const row = useSessions(state => (pane.sessionId ? state.byId[pane.sessionId] : undefined))
      const title = row && row.displayTitle
        ? row.displayTitle
        : pane.sessionId
          ? String(pane.sessionId).slice(0, 8)
          : t('noSession')
      const running = !!(row && row.running)
      return h('div', {
        style: styles.chip,
        'data-minimized-id': pane.id,
        title: t('restore'),
        onClick: onRestore,
      },
        h('span', {
          style: Object.assign({}, styles.dot, {
            background: running
              ? 'var(--dsw-alias-state-success-primary)'
              : 'var(--dsw-alias-state-idle-primary)',
          }),
          title: running ? t('running') : t('idle'),
        }),
        h('span', { style: styles.chipTitle }, title),
        h('span', { style: styles.spacer }),
        h(IconButton, {
          label: t('closePane'),
          disabled: !canClose,
          onClick: event => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
            onClose()
          },
        }, h(IconClose)))
    }

    /**
     * The reference is re-acquired when the binding id changes and released on
     * unmount; a failed attempt is retried when the catalogue learns the id
     * (a freshly created session) or when the list settles.
     */
    function usePaneReference(pane, sessions, phase, known, retryToken) {
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
      }, [pane.sessionId, phase, known, retryToken, sessions, release])

      useEffect(() => drop, [drop])

      return { reference, failure }
    }

    /** Session-scoped slot body: the official conversation occurrence. */
    function ConversationPane({ sessionId, useSession, useConversation, useSessions, renderFactorySlot, t }) {
      const tr = typeof t === 'function' ? t : key => key
      const [attempt, setAttempt] = useState(0)
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
      let content = null
      try {
        content = renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, {
          slots: { views: FixedChatConversationView },
        })
      } catch (error) {
        /* The factory slot is an internal contract; never blank the whole panel over it. */
        console.error('[multi-session] conversation.content is unavailable', error)
        return h('div', { style: styles.center },
          h('div', { style: styles.emptyTitle }, tr('viewUnavailable')),
          h('div', { style: styles.emptyHint }, tr('viewUnavailableHint')),
          h('button', {
            type: 'button',
            style: styles.primaryButton,
            onClick: () => setAttempt(value => value + 1),
          }, tr('retry')))
      }
      return h('div', { key: 'conversation-' + attempt, style: styles.conversation }, content)
    }

    function FixedChatConversationView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    function PaneBody({ pane, sessions, SessionProvider, renderSlot, useSessions, t, onPick, onCreate, creating, createError }) {
      const phase = useSessions(state => state.phase)
      const known = useSessions(state => (pane.sessionId ? state.byId[pane.sessionId] !== undefined : true))
      const [retryToken, setRetryToken] = useState(0)
      const { reference, failure } = usePaneReference(pane, sessions, phase, known, retryToken)
      const retry = useCallback(() => setRetryToken(value => value + 1), [])

      if (!pane.sessionId) {
        return h(EmptyState, { t, onPick, onCreate, creating, error: createError })
      }
      if (!reference) {
        if (failure && (known || phase !== 'loading')) {
          return h(UnavailableState, { t, onPick, onRetry: retry, detail: errorText(failure) })
        }
        return h(LoadingState, { t })
      }

      return h(SessionProvider, {
        session: reference,
        empty: () => (phase === 'loading' ? h(LoadingState, { t }) : h(UnavailableState, { t, onPick, onRetry: retry })),
      }, renderSlot(PANE_SLOT, {}))
    }

    class PaneBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null, attempt: 0 }
        this.reset = this.reset.bind(this)
        this.timer = null
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        console.error('[multi-session] pane crashed', error, info)
        /* Rebuild the pane a couple of times before asking the user to step in:
           most crashes come from a transient render race, not from the session. */
        if (this.state.attempt < 2) {
          this.timer = setTimeout(() => {
            this.timer = null
            this.setState(state => ({ error: null, attempt: state.attempt + 1 }))
          }, 600 * (this.state.attempt + 1))
        }
      }

      componentWillUnmount() {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
      }

      reset() {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        this.setState({ error: null, attempt: 0 })
      }

      render() {
        const { error, attempt } = this.state
        if (!error) return this.props.children
        return this.props.fallback(error, this.reset, attempt < 2)
      }
    }

    function PaneCrash({ error, t, onRetry, recovering }) {
      return h('div', { style: styles.center },
        h('div', { style: Object.assign({}, styles.emptyTitle, { color: 'var(--dsw-alias-label-error)' }) }, t('crashTitle')),
        h('div', { style: styles.emptyHint }, recovering ? t('autoRecovering') : t('crashHint')),
        h('div', { style: Object.assign({}, styles.emptyHint, { opacity: 0.7, fontSize: 11 }) }, errorText(error)),
        h('button', { type: 'button', style: styles.primaryButton, onClick: onRetry }, t('retry')))
    }

    /* ---------------------------------------------------------------- page */

    /** Catastrophic failures (bad stored layout, a slot contract change) still owe the user a way out. */
    class PageBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
        this.reset = this.reset.bind(this)
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        console.error('[multi-session] panel crashed', error, info)
      }

      reset() {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch (_unavailable) {
          /* Private mode or a blocked storage: nothing to clear. */
        }
        this.setState({ error: null })
      }

      render() {
        const { error } = this.state
        if (!error) return this.props.children
        const t = typeof this.props.t === 'function' ? this.props.t : key => key
        return h('div', { style: styles.center },
          h('div', { style: Object.assign({}, styles.emptyTitle, { color: 'var(--dsw-alias-label-error)' }) }, t('panelCrashTitle')),
          h('div', { style: styles.emptyHint }, t('panelCrashHint')),
          h('div', { style: Object.assign({}, styles.emptyHint, { opacity: 0.7, fontSize: 11 }) }, errorText(error)),
          h('button', { type: 'button', style: styles.primaryButton, onClick: this.reset }, t('resetLayout')))
      }
    }

    /**
     * One pane, memoised. Everything it receives is referentially stable while
     * the user drags a divider, so a drag only re-renders the tile wrappers and
     * never the conversation trees inside the panes.
     */
    const PaneShell = React.memo(function PaneShell(props) {      const {
        pane, maximized, canClose, picking, sessions, SessionProvider, renderSlot, useSessions, t,
        creating, createError, onOpenPicker, onToggleMax, onMinimize, onClose, onAssign, onClear, onCreate, onDismissPicker,
      } = props
      return h('div', { style: styles.pane },
        h(PaneHeader, {
          pane,
          maximized,
          canClose,
          useSessions,
          t,
          onPick: () => onOpenPicker(pane.id),
          onToggleMax: () => onToggleMax(pane.id),
          onMinimize: () => onMinimize(pane.id),
          onClose: () => onClose(pane.id),
        }),
        h('div', { style: styles.body },
          h(PaneBoundary, {
            fallback: (error, retry, recovering) => h(PaneCrash, { error, t, onRetry: retry, recovering }),
          }, h(PaneBody, {
            pane,
            sessions,
            SessionProvider,
            renderSlot,
            useSessions,
            t,
            onPick: () => onOpenPicker(pane.id),
            onCreate: () => onCreate(pane.id),
            creating,
            createError,
          })),
          picking ? h(SessionPicker, {
            currentSessionId: pane.sessionId,
            useSessions,
            t,
            onPick: sessionId => onAssign(pane.id, sessionId),
            onClear: () => onClear(pane.id),
            onCreate: () => onCreate(pane.id),
            creating,
            error: createError,
            onClose: onDismissPicker,
          }) : null))
    })

    function MultiSessionPage(props) {
      return h(PageBoundary, { t: props.t }, h(MultiSessionView, props))
    }

    function MultiSessionView(props) {
      const { SessionProvider, renderSlot, useSessions, useWorkspaces, sessions, t } = props
      const [layout, setLayout] = useState(loadLayout)
      const [pickingId, setPickingId] = useState(null)
      const [creatingPane, setCreatingPane] = useState(null)
      const [workspaceFor, setWorkspaceFor] = useState(null)
      const [createFailure, setCreateFailure] = useState(null)
      const [draft, setDraft] = useState(null)
      const rootRef = useRef(null)
      const hostRef = useRef(null)
      const dragRef = useRef(null)
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
        setLayout(makeLayout(defaultPanes(snapshot), null))
      }, [layout, phase, sessions])

      useEffect(() => {
        if (layout === null) return
        const timer = setTimeout(() => saveLayout(layout), 200)
        return () => clearTimeout(timer)
      }, [layout])

      const maximizedId = layout ? layout.maximizedId : null
      const immersive = layout ? layout.immersive === true : false
      /* Drag previews live in `draft` so the committed layout only changes on release. */
      const rowWeights = layout ? (draft ? draft.rowWeights : layout.rowWeights) : []
      const colWeights = layout ? (draft ? draft.colWeights : layout.colWeights) : {}
      useEffect(() => {
        if (!maximizedId && !immersive) return
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          setLayout(previous => {
            if (!previous) return previous
            if (previous.maximizedId) return Object.assign({}, previous, { maximizedId: null })
            if (previous.immersive) return Object.assign({}, previous, { immersive: false })
            return previous
          })
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [maximizedId, immersive])

      const addPane = useCallback(() => {
        const id = nextPaneId()
        setLayout(previous => {
          if (!previous) return previous
          const rows = previous.rows.map(row => row.slice())
          const weights = previous.rowWeights.slice()
          const last = rows.length - 1
          if (last >= 0 && rows[last].length < 2) {
            rows[last].push(id)
          } else {
            rows.push([id])
            weights.push(1)
          }
          return Object.assign({}, previous, {
            panes: previous.panes.concat([{ id, sessionId: null }]),
            rows,
            rowWeights: weights,
            colWeights: Object.assign({}, previous.colWeights, { [id]: 1 }),
            maximizedId: null,
          })
        })
        setPickingId(id)
      }, [])

      const closePane = useCallback(id => {
        setLayout(previous => {
          if (!previous || previous.panes.length <= 1) return previous
          const rows = []
          const weights = []
          previous.rows.forEach((row, index) => {
            const kept = row.filter(item => item !== id)
            if (kept.length > 0) {
              rows.push(kept)
              weights.push(previous.rowWeights[index] || 1)
            }
          })
          const colWeights = Object.assign({}, previous.colWeights)
          delete colWeights[id]
          return Object.assign({}, previous, {
            panes: previous.panes.filter(pane => pane.id !== id),
            rows,
            rowWeights: weights,
            colWeights,
            maximizedId: previous.maximizedId === id ? null : previous.maximizedId,
          })
        })
        setPickingId(current => (current === id ? null : current))
        setWorkspaceFor(current => (current === id ? null : current))
      }, [])

      const toggleMaximize = useCallback(id => {
        setLayout(previous => {
          if (!previous) return previous
          return Object.assign({}, previous, { maximizedId: previous.maximizedId === id ? null : id })
        })
      }, [])

      /** Fill the whole window with the panel; the grid itself is untouched. */
      const toggleImmersive = useCallback(() => {
        setLayout(previous => (previous
          ? Object.assign({}, previous, { immersive: previous.immersive !== true })
          : previous))
      }, [])

      /** Collapse a pane to a chip above the grid; expanding puts it back in its row. */
      const toggleMinimize = useCallback(id => {
        setLayout(previous => {
          if (!previous) return previous
          let collapsed = false
          const panes = previous.panes.map(pane => {
            if (pane.id !== id) return pane
            collapsed = !pane.minimized
            return Object.assign({}, pane, { minimized: collapsed })
          })
          return Object.assign({}, previous, {
            panes,
            maximizedId: collapsed && previous.maximizedId === id ? null : previous.maximizedId,
          })
        })
        setPickingId(current => (current === id ? null : current))
      }, [])

      const assignSession = useCallback((id, sessionId) => {
        setCreateFailure(null)
        setLayout(previous => {
          if (!previous) return previous
          return Object.assign({}, previous, {
            panes: previous.panes.map(pane => (pane.id === id ? Object.assign({}, pane, { sessionId }) : pane)),
          })
        })
        setPickingId(null)
      }, [])

      const clearPane = useCallback(id => { assignSession(id, null) }, [assignSession])
      const dismissPicker = useCallback(() => setPickingId(null), [])
      const togglePicker = useCallback(id => {
        setPickingId(current => (current === id ? null : id))
      }, [])

      /**
       * Drag a divider between two tiles. The pair keeps its combined size, so
       * growing one shrinks the other, exactly like a tmux pane border. A row
       * divider resizes both rows (and therefore every pane in them); a column
       * divider only resizes the two neighbours inside one row.
       */
      const beginSplitDrag = useCallback((event, axis, index) => {
        if (!layout || layout.maximizedId) return
        if (dragRef.current) return
        if (event.button !== undefined && event.button !== 0) return
        const host = hostRef.current
        if (!host || typeof host.getBoundingClientRect !== 'function') return
        const box = host.getBoundingClientRect()
        if (!box || !(box.width > 0) || !(box.height > 0)) return

        const baseRows = (draft ? draft.rowWeights : layout.rowWeights).slice()
        const baseCols = Object.assign({}, draft ? draft.colWeights : layout.colWeights)
        let startA = 0
        let startB = 0
        let pixelsPerWeight = 0
        let minPixels = 0
        let pairKey = null
        let rowPair = null
        const grid = visibleGrid(layout)

        if (axis === 'row') {
          const position = grid.findIndex(entry => entry.index === index)
          if (position < 0 || position + 1 >= grid.length) return
          rowPair = [grid[position].index, grid[position + 1].index]
          startA = baseRows[rowPair[0]] || 1
          startB = baseRows[rowPair[1]] || 1
          const sum = baseRows.reduce((total, weight) => total + (weight > 0 ? weight : 1), 0)
          const available = Math.max(0, box.height - PAD * 2 - SPLITTER * Math.max(0, grid.length - 1))
          pixelsPerWeight = sum > 0 ? available / sum : 0
          minPixels = MIN_PANE_H
        } else {
          const entry = grid.find(item => item.index === index)
          if (!entry || entry.ids.length < 2) return
          pairKey = [entry.ids[0], entry.ids[1]]
          startA = baseCols[pairKey[0]] || 1
          startB = baseCols[pairKey[1]] || 1
          const available = Math.max(0, box.width - PAD * 2 - SPLITTER)
          pixelsPerWeight = startA + startB > 0 ? available / (startA + startB) : 0
          minPixels = MIN_PANE_W
        }
        if (!(pixelsPerWeight > 0)) return

        const pair = startA + startB
        const floor = Math.min(minPixels / pixelsPerWeight, pair / 2)
        const startX = event.clientX
        const startY = event.clientY
        let moved = false
        let nextRowWeights = baseRows
        let nextColWeights = baseCols
        dragRef.current = { axis, index }

        const onMove = moveEvent => {
          if (!dragRef.current) return
          const deltaPixels = axis === 'row' ? moveEvent.clientY - startY : moveEvent.clientX - startX
          if (!moved && Math.abs(deltaPixels) < 2) return
          moved = true
          const a = clamp(startA + deltaPixels / pixelsPerWeight, floor, pair - floor)
          const b = pair - a
          if (axis === 'row') {
            nextRowWeights = baseRows.slice()
            nextRowWeights[rowPair[0]] = a
            nextRowWeights[rowPair[1]] = b
            setDraft({ rowWeights: nextRowWeights, colWeights: baseCols })
          } else {
            nextColWeights = Object.assign({}, baseCols)
            nextColWeights[pairKey[0]] = a
            nextColWeights[pairKey[1]] = b
            setDraft({ rowWeights: baseRows, colWeights: nextColWeights })
          }
          if (moveEvent.cancelable) moveEvent.preventDefault()
        }

        const finish = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          dragRef.current = null
          setDraft(null)
          if (!moved) return
          setLayout(previous => (previous
            ? Object.assign({}, previous, { rowWeights: nextRowWeights, colWeights: nextColWeights })
            : previous))
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        if (event.cancelable) event.preventDefault()
      }, [draft, layout])

      /** Put every divider back to an even split. */
      const autoArrange = useCallback(() => {
        setLayout(previous => {
          if (!previous) return previous
          const colWeights = {}
          for (const pane of previous.panes) colWeights[pane.id] = 1
          return Object.assign({}, previous, {
            maximizedId: null,
            rowWeights: previous.rows.map(() => 1),
            colWeights,
          })
        })
      }, [])

      /** Create a fresh session for one pane and bind it there. */
      const createSession = useCallback((paneId, workspaceId) => {
        if (creatingPane !== null) return
        const target = layout ? layout.panes.find(pane => pane.id === paneId) : null
        if (!target) return
        let snapshot = null
        try {
          snapshot = sessions.list.getSnapshot()
        } catch (_unavailable) {
          snapshot = null
        }
        /* An explicit workspace goes straight to the Host; neither path navigates. */
        const request = workspaceId ? { workspaceId } : createTarget(target, workspaces, snapshot)
        setWorkspaceFor(null)
        setPickingId(null)
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

      /**
       * Ask where a new session should live. The hero picker inside a blank
       * conversation calls uiWorkspace.openWorkspace, which reveals the new
       * session in the main panel; picking here avoids that reveal.
       */
      const requestCreate = useCallback(paneId => {
        if (creatingPane !== null) return
        const items = workspaces && Array.isArray(workspaces.items) ? workspaces.items : []
        setPickingId(null)
        setCreateFailure(null)
        /* Wait for the catalogue before falling back: an empty list may just be loading. */
        if (items.length === 0 && (!workspaces || workspaces.phase === 'ready')) {
          createSession(paneId, null)
          return
        }
        setWorkspaceFor(paneId)
      }, [createSession, creatingPane, workspaces])

      let body = h('div', { style: styles.center }, h('div', { style: styles.emptyHint }, t('loading')))
      if (layout !== null) {
        const panes = layout.panes
        const byId = {}
        for (const pane of panes) byId[pane.id] = pane

        const renderCell = pane => {
          const isMax = maximizedId === pane.id
          return h('div', {
            key: pane.id,
            'data-pane-id': pane.id,
            style: Object.assign(
              { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
              isMax
                /* The maximised tile covers the host instead of being re-parented, so the
                   conversation (scroll position, stream) survives the toggle. */
                ? { position: 'absolute', top: PAD, left: PAD, right: PAD, bottom: PAD, zIndex: 20, visibility: 'visible' }
                : { flexGrow: colWeights[pane.id] || 1, flexBasis: 0 },
            ),
          }, h(PaneShell, {
            pane,
            maximized: isMax,
          canClose: panes.length > 1,
          picking: pickingId === pane.id,
          sessions,
          SessionProvider,
          renderSlot,
          useSessions,
          t,
          creating: creatingPane === pane.id,
          createError: createFailure && createFailure.paneId === pane.id ? createFailure.message : null,
          onOpenPicker: togglePicker,
          onToggleMax: toggleMaximize,
          onMinimize: toggleMinimize,
          onClose: closePane,
          onAssign: assignSession,
          onClear: clearPane,
          onCreate: requestCreate,
          onDismissPicker: dismissPicker,
        }))
        }

        const minimizedPanes = panes.filter(pane => pane.minimized)

        /* Tiles never overlap: rows split the height, the panes of a row split its width. */
        const view = []
        const grid = visibleGrid(layout)
        grid.forEach((entry, position) => {
          const cells = []
          entry.ids.forEach((id, colIndex) => {
            const pane = byId[id]
            if (!pane) return
            if (colIndex > 0) {
              cells.push(h('div', {
                key: 'divider-v-' + id,
                style: styles.splitterV,
                title: t('dragHint'),
                onPointerDown: event => beginSplitDrag(event, 'col', entry.index),
              }))
            }
            cells.push(renderCell(pane))
          })
          view.push(h('div', {
            key: 'row-' + entry.index,
            style: Object.assign({}, styles.tileRow, { flexGrow: rowWeights[entry.index] || 1 }),
          }, cells))
          if (position < grid.length - 1) {
            view.push(h('div', {
              key: 'divider-h-' + entry.index,
              style: styles.splitterH,
              title: t('dragHint'),
              onPointerDown: event => beginSplitDrag(event, 'row', entry.index),
            }))
          }
        })

        body = h(React.Fragment, null,
          h('div', { style: styles.toolbar },
            h('span', { style: styles.toolbarTitle }, t('panelLabel')),
            h('span', { style: styles.toolbarMeta, title: 'dsh-multi-session ' + VERSION }, 'v' + VERSION),
            h('span', { style: styles.toolbarMeta }, panes.length + ' ' + t('paneCount')),
            h('span', { style: styles.spacer }),
            h('button', {
              type: 'button',
              style: styles.iconGhost,
              title: immersive ? t('exitImmersive') : t('immersive') + ' — ' + t('immersiveHint'),
              'aria-label': immersive ? t('exitImmersive') : t('immersive'),
              'aria-pressed': immersive ? 'true' : 'false',
              onClick: toggleImmersive,
            }, h(immersive ? IconCollapse : IconExpand)),
            h('button', {
              type: 'button',
              style: styles.ghostButton,
              title: t('autoArrange'),
              onClick: autoArrange,
            }, t('autoArrange')),
            h('button', {
              type: 'button',
              style: styles.ghostButton,
              title: t('addPane'),
              onClick: addPane,
            }, '+ ' + t('addPane'))),
          minimizedPanes.length > 0 && h('div', {
            style: styles.minimizedBar,
            'data-minimized-bar': '',
          },
            h('span', { style: styles.toolbarMeta }, t('minimizedBar')),
            minimizedPanes.map(pane => h(MinimizedChip, {
              key: pane.id,
              pane,
              useSessions,
              t,
              canClose: panes.length > 1,
              onRestore: () => toggleMinimize(pane.id),
              onClose: () => closePane(pane.id),
            }))),
          h('div', {
            ref: hostRef,
            style: styles.host,
            'data-multisession-host': '',
          },
            h('div', {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flex: '1 1 auto',
                minHeight: 0,
                /* While one tile is maximised the others stay mounted but invisible. */
                visibility: maximizedId ? 'hidden' : 'visible',
              },
            }, grid.length === 0
              ? h('div', { style: styles.center },
                h('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5 } }, t('allMinimized')))
              : view)))
      }

      return h('div', {
        ref: rootRef,
        style: immersive ? Object.assign({}, styles.root, styles.immersive) : styles.root,
        'data-immersive': immersive ? '' : undefined,
      },
        body,
        workspaceFor
          ? h(WorkspacePicker, {
            t,
            workspaces,
            busy: creatingPane !== null,
            onPick: workspaceId => createSession(workspaceFor, workspaceId),
            onCancel: () => setWorkspaceFor(null),
          })
          : null)
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
