/** @odoo-module */

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";
import {
    computeGridTarget,
    countColumns,
    isEditableTarget,
    ScanGuard,
    SerialQueue,
    useWindowKeyListeners,
} from "@pos_keyboard_shortcut_advanced/app/shortcut_utils";
import { PksaShortcutHelpPopup } from "@pos_keyboard_shortcut_advanced/app/shortcut_help_popup";

const CARD_SELECTOR = ".product-list article.product";
const MARK_CLASS = "pksa-focused";
const SEARCH_SELECTOR = ".pos-rightheader input";
const SELECTED_LINE_SELECTOR = ".order-container .orderline.selected";
const SWALLOW_WINDOW_MS = 2000;

const GRID_DIRECTIONS = {
    grid_up: "up",
    grid_down: "down",
    grid_left: "left",
    grid_right: "right",
};

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this._pksaQueue = new SerialQueue({ maxPending: 100 });
        this._pksaScanGuard = new ScanGuard(session.max_time_between_keys_in_ms || 100);
        this._pksaSwallow = null;
        this._pksaMarkedEl = null;
        useWindowKeyListeners({
            keydown: this._pksaOnKeydown.bind(this),
            keyupCapture: this._pksaOnKeyupCapture.bind(this),
            focusin: this._pksaOnFocusin.bind(this),
        });
    },

    // ------------------------------------------------------------------
    // Event plumbing
    // ------------------------------------------------------------------
    _pksaOnKeydown(ev) {
        // Must run for every key (cheap) so a scanner burst is recognised.
        this._pksaScanGuard.record(ev);
        const registry = this.pos.pksaRegistry;
        if (!registry || !registry.size) {
            return;
        }
        const shortcut = registry.lookup(ev);
        if (!shortcut) {
            return;
        }
        // Already consumed (e.g. the barcode service recognised a scan).
        if (ev.defaultPrevented || ev.isComposing) {
            return;
        }
        if (!this._pksaIsActive()) {
            return;
        }
        if (isEditableTarget(ev.target) && !shortcut.hasModifier && !shortcut.isFunctionKey) {
            return; // inputs (search bar...) keep arrows, Enter, etc.
        }
        if (this._pksaRun(shortcut.action, ev)) {
            ev.preventDefault();
        }
    },
    _pksaOnKeyupCapture(ev) {
        const swallow = this._pksaSwallow;
        if (!swallow) {
            return;
        }
        if (ev.key === swallow.key && ev.timeStamp - swallow.at < SWALLOW_WINDOW_MS) {
            // The keydown already acted; don't let this keyup confirm a popup
            // the action may have opened (popups confirm on keyup Enter).
            ev.stopImmediatePropagation();
            ev.stopPropagation();
        }
        if (ev.key === swallow.key) {
            this._pksaSwallow = null;
        }
    },
    _pksaOnFocusin(ev) {
        const el = ev.target;
        if (el && el.matches && el.matches(CARD_SELECTOR)) {
            this._pksaMark(el);
        }
    },
    _pksaIsActive() {
        // Popups are dialogs in Odoo 18: pause while one is open.
        return !document.querySelector(".o_dialog:not(.o_inactive_modal)");
    },
    /**
     * Dispatch an action. Returns true when the key was handled and its
     * browser default must be prevented.
     */
    _pksaRun(action, ev) {
        if (action in GRID_DIRECTIONS) {
            return this._pksaMoveGrid(GRID_DIRECTIONS[action]);
        }
        switch (action) {
            case "orderline_prev":
                return this._pksaMoveOrderline(-1);
            case "orderline_next":
                return this._pksaMoveOrderline(1);
            case "activate_product":
                return this._pksaActivateFocused(ev);
            case "focus_search":
                return this._pksaFocusSearch();
            case "focus_grid":
                return this._pksaFocusGrid();
            case "go_payment":
                // same as the Payment / Pay buttons
                this.pos.pay();
                return true;
            case "show_help":
                this._pksaShowHelp();
                return true;
            default:
                return false;
        }
    },

    // ------------------------------------------------------------------
    // Product grid
    // ------------------------------------------------------------------
    _pksaCards() {
        return document.querySelectorAll(CARD_SELECTOR);
    },
    _pksaCurrentIndex(cards) {
        const active = document.activeElement;
        let ref = active && active.matches && active.matches(CARD_SELECTOR) ? active : null;
        if (!ref && this._pksaMarkedEl && this._pksaMarkedEl.isConnected) {
            ref = this._pksaMarkedEl;
        }
        if (!ref) {
            return -1;
        }
        return Array.prototype.indexOf.call(cards, ref);
    },
    _pksaGridMetrics(cards) {
        const list = cards[0].parentElement;
        const style = window.getComputedStyle(list);
        let columns = 0;
        if (style.display === "grid" || style.display === "inline-grid") {
            const tracks = style.gridTemplateColumns;
            if (tracks && tracks !== "none") {
                columns = tracks.trim().split(/\s+/).length;
            }
        }
        if (!columns) {
            columns = countColumns(cards, (el) => el.offsetTop);
        }
        return { columns, rtl: style.direction === "rtl" };
    },
    _pksaMoveGrid(direction) {
        const cards = this._pksaCards();
        if (!cards.length) {
            return false;
        }
        const index = this._pksaCurrentIndex(cards);
        const { columns, rtl } = this._pksaGridMetrics(cards);
        const target = computeGridTarget({ count: cards.length, columns, index, direction, rtl });
        if (target >= 0) {
            this._pksaFocusCard(cards[target]);
        }
        return true;
    },
    _pksaFocusCard(el) {
        if (!el) {
            return;
        }
        this._pksaMark(el);
        if (document.activeElement !== el) {
            el.focus({ preventScroll: true });
        }
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    _pksaMark(el) {
        if (this._pksaMarkedEl === el) {
            return;
        }
        if (this._pksaMarkedEl) {
            this._pksaMarkedEl.classList.remove(MARK_CLASS);
        }
        el.classList.add(MARK_CLASS);
        this._pksaMarkedEl = el;
    },
    _pksaFocusGrid() {
        const cards = this._pksaCards();
        if (!cards.length) {
            return false;
        }
        const index = this._pksaCurrentIndex(cards);
        this._pksaFocusCard(cards[index >= 0 ? index : 0]);
        return true;
    },
    _pksaFocusSearch() {
        const input = document.querySelector(SEARCH_SELECTOR);
        if (!input) {
            return false;
        }
        input.focus();
        input.select();
        return true;
    },

    // ------------------------------------------------------------------
    // Enter = mouse click
    // ------------------------------------------------------------------
    _pksaActivateFocused(ev) {
        const active = document.activeElement;
        if (!active || !active.matches || !active.matches(CARD_SELECTOR)) {
            return false; // Enter keeps its native meaning everywhere else
        }
        if (ev.repeat) {
            return true; // holding Enter must not machine-gun the order
        }
        if (this._pksaScanGuard.isScanning(ev.timeStamp)) {
            return false; // terminating Enter of a scanner burst
        }
        const product = this.pos.models["product.product"].get(parseInt(active.dataset.productId, 10));
        if (!product) {
            return false;
        }
        this._pksaSwallow = { key: ev.key, at: ev.timeStamp };
        this._pksaQueue.push(() => this._pksaActivateProduct(product));
        return true;
    },
    /**
     * Exactly what a mouse click on the card does: ProductCard's onClick is
     * `ProductScreen.addProductToOrder(product)`. Any module extending it
     * (packaging, lots, configurator, weighing...) is therefore honoured.
     */
    _pksaActivateProduct(product) {
        return this.addProductToOrder(product);
    },

    // ------------------------------------------------------------------
    // Order lines
    // ------------------------------------------------------------------
    _pksaMoveOrderline(step) {
        const order = this.currentOrder;
        if (!order) {
            return false;
        }
        const lines = order.get_orderlines();
        if (!lines.length) {
            return true;
        }
        const selected = order.get_selected_orderline();
        let index = selected ? lines.indexOf(selected) : -1;
        if (index < 0) {
            index = step > 0 ? -1 : lines.length;
        }
        const next = Math.max(0, Math.min(lines.length - 1, index + step));
        if (lines[next] !== selected) {
            // same as clicking the line (OrderSummary.clickLine)
            this.numberBuffer.reset();
            this.pos.selectOrderLine(order, lines[next]);
            this._pksaScrollSelectedLine();
        }
        return true;
    },
    _pksaScrollSelectedLine() {
        requestAnimationFrame(() => {
            const el = document.querySelector(SELECTED_LINE_SELECTOR);
            if (el) {
                el.scrollIntoView({ block: "nearest" });
            }
        });
    },

    // ------------------------------------------------------------------
    // Help
    // ------------------------------------------------------------------
    _pksaShowHelp() {
        this.dialog.add(PksaShortcutHelpPopup, {});
    },
});
