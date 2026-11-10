/** @odoo-module */

import { onMounted, onWillUnmount } from "@odoo/owl";
/**
 * Pure, DOM-light helpers for the keyboard engine. Everything here is
 * framework-agnostic on purpose so it can be unit tested with QUnit
 * without booting a POS session.
 */

// Keep in sync with SHORTCUT_ACTIONS / DEFAULT_COMBOS in
// models/pos_keyboard_shortcut.py
export const ACTIONS = [
    'orderline_prev', 'orderline_next',
    'grid_up', 'grid_down', 'grid_left', 'grid_right',
    'activate_product', 'focus_search', 'focus_grid', 'go_payment', 'show_help',
];
export const DEFAULT_SHORTCUTS = [
    { action: 'orderline_prev', key: 'PageUp' },
    { action: 'orderline_next', key: 'PageDown' },
    { action: 'grid_up', key: 'ArrowUp' },
    { action: 'grid_down', key: 'ArrowDown' },
    { action: 'grid_left', key: 'ArrowLeft' },
    { action: 'grid_right', key: 'ArrowRight' },
    { action: 'activate_product', key: 'Enter' },
    { action: 'focus_search', key: 'F2' },
    { action: 'focus_grid', key: 'F3' },
    { action: 'go_payment', key: 'F9' },
    { action: 'show_help', key: 'F1' },
];

const NAMED_KEYS = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown',
    'Home', 'End', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert', 'Space',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];
const NAMED_KEYS_LOWER = new Map(NAMED_KEYS.map((k) => [k.toLowerCase(), k]));
const KEY_ALIASES = new Map([
    ['spacebar', 'Space'], ['esc', 'Escape'], ['del', 'Delete'],
    ['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight'],
    ['pgup', 'PageUp'], ['pgdn', 'PageDown'], ['return', 'Enter'], ['ins', 'Insert'],
]);

export function normalizeKey(key) {
    if (key === undefined || key === null) {
        return '';
    }
    if (key === ' ') {
        return 'Space';
    }
    key = String(key).trim();
    if (!key) {
        return '';
    }
    if (key.length === 1) {
        return key.toLowerCase();
    }
    const lower = key.toLowerCase();
    return KEY_ALIASES.get(lower) || NAMED_KEYS_LOWER.get(lower) || key;
}

export function comboFromParts(key, ctrl, alt, shift) {
    let combo = '';
    if (ctrl) combo += 'ctrl+';
    if (alt) combo += 'alt+';
    if (shift) combo += 'shift+';
    return combo + normalizeKey(key);
}

export function comboFromEvent(ev) {
    // metaKey (Cmd on macOS) is treated like Ctrl for cross-platform maps.
    return comboFromParts(ev.key, ev.ctrlKey || ev.metaKey, ev.altKey, ev.shiftKey);
}

export function displayCombo(combo) {
    if (!combo) return '';
    const parts = combo.split('+');
    const key = parts.pop() || '+';
    const labels = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' };
    return parts.map((p) => labels[p] || p).concat(key.length === 1 ? key.toUpperCase() : key).join('+');
}

/**
 * O(1) lookup table: normalized combo -> shortcut record.
 */
export class KeyRegistry {
    constructor(records) {
        this.byCombo = new Map();
        this.byAction = new Map();
        this.records = [];
        if (records) {
            this.load(records);
        }
    }
    load(records) {
        const byCombo = new Map();
        const byAction = new Map();
        const sorted = [...(records || [])].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        const kept = [];
        for (const rec of sorted) {
            if (!rec || !rec.action || !rec.key) continue;
            const combo = comboFromParts(rec.key, rec.ctrl_key, rec.alt_key, rec.shift_key);
            if (byCombo.has(combo)) continue; // first one (by sequence) wins
            const entry = Object.freeze({
                id: rec.id,
                action: rec.action,
                name: rec.name || rec.action,
                combo,
                display: rec.combo_display || displayCombo(combo),
                hasModifier: Boolean(rec.ctrl_key || rec.alt_key),
                isFunctionKey: /^F\d{1,2}$/.test(normalizeKey(rec.key)),
            });
            byCombo.set(combo, entry);
            if (!byAction.has(entry.action)) byAction.set(entry.action, []);
            byAction.get(entry.action).push(entry);
            kept.push(entry);
        }
        // swap atomically so a keydown never sees a half-built table
        this.byCombo = byCombo;
        this.byAction = byAction;
        this.records = kept;
        return this;
    }
    get size() {
        return this.byCombo.size;
    }
    lookup(ev) {
        if (!this.byCombo.size || !ev || !ev.key) return null;
        return this.byCombo.get(comboFromEvent(ev)) || null;
    }
    combosFor(action) {
        return (this.byAction.get(action) || []).map((e) => e.display);
    }
    describe() {
        return this.records.map((e) => ({ action: e.action, name: e.name, display: e.display }));
    }
}

/**
 * Number of columns of a wrapped grid, measured from the first row.
 * @param {ArrayLike<any>} items
 * @param {(item:any)=>number} getTop
 */
export function countColumns(items, getTop, tolerance = 2) {
    const count = items.length;
    if (!count) return 0;
    const firstTop = getTop(items[0]);
    let cols = 1;
    while (cols < count && Math.abs(getTop(items[cols]) - firstTop) <= tolerance) {
        cols++;
    }
    return cols;
}

/**
 * Pure 2D navigation over a row-major grid.
 * @param {{count:number, columns:number, index:number, direction:'up'|'down'|'left'|'right', rtl?:boolean}} p
 * @returns {number} target index, or -1 when the grid is empty
 */
export function computeGridTarget({ count, columns, index, direction, rtl = false }) {
    if (!count) return -1;
    const cols = Math.max(1, Math.min(columns || 1, count));
    if (index === undefined || index === null || index < 0 || index >= count) {
        return 0;
    }
    let forward;
    switch (direction) {
        case 'right':
            forward = !rtl;
            return forward ? Math.min(index + 1, count - 1) : Math.max(index - 1, 0);
        case 'left':
            forward = rtl;
            return forward ? Math.min(index + 1, count - 1) : Math.max(index - 1, 0);
        case 'down': {
            if (index + cols < count) return index + cols;
            const lastRow = Math.floor((count - 1) / cols);
            // a partial last row exists below: land on its last card
            return Math.floor(index / cols) < lastRow ? count - 1 : index;
        }
        case 'up':
            return index - cols >= 0 ? index - cols : index;
        default:
            return index;
    }
}

/**
 * 2D navigation over several stacked grids (Odoo 19 can group products by
 * category: one `.product-list` per category, each with its own columns).
 * `index` is global (reading order across all sections). Up/Down cross into
 * the neighbouring section, keeping the visual column when possible.
 *
 * @param {{sections:{count:number, columns:number}[], index:number,
 *          direction:'up'|'down'|'left'|'right', rtl?:boolean}} p
 * @returns {number} target global index, or -1 when there is no card
 */
export function computeSectionedTarget({ sections, index, direction, rtl = false }) {
    const valid = (sections || []).filter((s) => s && s.count > 0);
    const total = valid.reduce((n, s) => n + s.count, 0);
    if (!total) return -1;
    if (index === undefined || index === null || index < 0 || index >= total) return 0;
    if (direction === "left" || direction === "right") {
        const forward = (direction === "right") !== rtl;
        return forward ? Math.min(index + 1, total - 1) : Math.max(index - 1, 0);
    }
    // locate the section
    let start = 0;
    let si = 0;
    while (index >= start + valid[si].count) {
        start += valid[si].count;
        si++;
    }
    const sec = valid[si];
    const cols = Math.max(1, Math.min(sec.columns || 1, sec.count));
    const local = index - start;
    const col = local % cols;
    if (direction === "down") {
        if (local + cols < sec.count) return index + cols;
        const lastRow = Math.floor((sec.count - 1) / cols);
        if (Math.floor(local / cols) < lastRow) return start + sec.count - 1;
        if (si + 1 < valid.length) {
            const next = valid[si + 1];
            return start + sec.count + Math.min(col, next.count - 1);
        }
        return index;
    }
    if (direction === "up") {
        if (local - cols >= 0) return index - cols;
        if (si > 0) {
            const prev = valid[si - 1];
            const pcols = Math.max(1, Math.min(prev.columns || 1, prev.count));
            const lastRowStart = Math.floor((prev.count - 1) / pcols) * pcols;
            return start - prev.count + Math.min(lastRowStart + col, prev.count - 1);
        }
        return index;
    }
    return index;
}

/**
 * Shortcuts that apply to one POS: global ones plus those bound to it, a
 * POS-bound shortcut replacing the global shortcuts of the same action.
 * Accepts POS records (config_ids = records) or RPC dicts (config_ids = ids).
 */
export function effectiveShortcuts(records, configId) {
    const idOf = (c) => (c && typeof c === "object" ? c.id : c);
    const scope = (r) => (r.config_ids || []).map(idOf).filter((id) => id !== undefined && id !== null);
    const applicable = [...(records || [])].filter((r) => {
        if (!r || r.active === false) return false;
        const ids = scope(r);
        return !ids.length || ids.includes(configId);
    });
    const specific = new Set(applicable.filter((r) => scope(r).length).map((r) => r.action));
    return applicable.filter((r) => scope(r).length || !specific.has(r.action));
}

/**
 * Recognises a barcode scanner burst (fast printable keys) so that the
 * terminating Enter is left to the barcode service.
 */
export class ScanGuard {
    constructor(maxGapMs = 100, minLength = 3) {
        this.maxGapMs = maxGapMs;
        this.minLength = minLength;
        this.run = 0;
        this.last = -Infinity;
    }
    record(ev) {
        if (!ev || !ev.key || ev.key.length !== 1 || ev.ctrlKey || ev.altKey || ev.metaKey) return;
        const ts = ev.timeStamp || 0;
        this.run = ts - this.last <= this.maxGapMs ? this.run + 1 : 1;
        this.last = ts;
    }
    isScanning(ts) {
        return this.run >= this.minLength && (ts || 0) - this.last <= this.maxGapMs;
    }
    reset() {
        this.run = 0;
        this.last = -Infinity;
    }
}

/**
 * Runs async tasks strictly one after the other (FIFO), so N rapid
 * presses produce exactly N sequential actions. Errors are surfaced to
 * the caller's promise (and thus to the POS error handler) without
 * breaking the chain.
 */
export class SerialQueue {
    constructor({ maxPending = 50 } = {}) {
        this.maxPending = maxPending;
        this.pending = 0;
        this.tail = Promise.resolve();
    }
    push(task) {
        if (this.pending >= this.maxPending) {
            return null;
        }
        this.pending++;
        const run = this.tail.then(() => task());
        this.tail = run.then(
            () => { this.pending--; },
            () => { this.pending--; }
        );
        return run;
    }
    get idle() {
        return this.tail;
    }
}

export function isEditableTarget(el) {
    if (!el || !el.matches) return false;
    return el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/**
 * Global counter of attached window listeners; lets tests (and debug)
 * prove there is no listener leak/duplication across re-renders.
 */
export const ListenerStats = { active: 0, attachCount: 0, detachCount: 0 };

/**
 * Attach window-level key listeners for the lifetime of the *mounted*
 * component. Bound exactly once per mount (re-renders do not re-bind),
 * always removed on unmount.
 *
 * @param {{keydown?:Function, keyupCapture?:Function, focusin?:Function}} handlers
 */
export function useWindowKeyListeners(handlers) {
    const bindings = [];
    if (handlers.keydown) bindings.push(['keydown', handlers.keydown, false]);
    if (handlers.keyupCapture) bindings.push(['keyup', handlers.keyupCapture, true]);
    if (handlers.focusin) bindings.push(['focusin', handlers.focusin, false]);
    let attached = false;
    onMounted(() => {
        if (attached) return;
        for (const [type, fn, capture] of bindings) {
            window.addEventListener(type, fn, capture);
        }
        attached = true;
        ListenerStats.active++;
        ListenerStats.attachCount++;
    });
    onWillUnmount(() => {
        if (!attached) return;
        for (const [type, fn, capture] of bindings) {
            window.removeEventListener(type, fn, capture);
        }
        attached = false;
        ListenerStats.active--;
        ListenerStats.detachCount++;
    });
}
