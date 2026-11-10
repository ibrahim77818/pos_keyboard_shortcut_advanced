odoo.define('pos_keyboard_shortcut_advanced.ProductScreen', function (require) {
    'use strict';

    const ProductScreen = require('point_of_sale.ProductScreen');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const { session } = require('@web/session');
    const {
        computeGridTarget,
        countColumns,
        isEditableTarget,
        ScanGuard,
        SerialQueue,
        useWindowKeyListeners,
    } = require('pos_keyboard_shortcut_advanced.utils');

    const CARD_SELECTOR = '.product-list article.product';
    const MARK_CLASS = 'pksa-focused';
    const SEARCH_SELECTOR = '.products-widget-control .pos-search-bar input, .products-widget-control .search-bar-container input';
    const SWALLOW_WINDOW_MS = 2000;

    const GRID_DIRECTIONS = {
        grid_up: 'up',
        grid_down: 'down',
        grid_left: 'left',
        grid_right: 'right',
    };

    const PksaProductScreen = (ProductScreen) => class PksaProductScreen extends ProductScreen {
        setup() {
            super.setup();
            this._pksaQueue = new SerialQueue({ maxPending: 100 });
            this._pksaScanGuard = new ScanGuard(session.max_time_between_keys_in_ms || 100);
            this._pksaSwallow = null;
            this._pksaMarkedEl = null;
            useWindowKeyListeners({
                keydown: this._pksaOnKeydown.bind(this),
                keyupCapture: this._pksaOnKeyupCapture.bind(this),
                focusin: this._pksaOnFocusin.bind(this),
            });
        }

        // ------------------------------------------------------------------
        // Event plumbing
        // ------------------------------------------------------------------
        _pksaOnKeydown(ev) {
            // Must run for every key (cheap) so a scanner burst is recognised.
            this._pksaScanGuard.record(ev);
            const registry = this.env.pos.pksaRegistry;
            if (!registry || !registry.size) return;
            const shortcut = registry.lookup(ev);
            if (!shortcut) return;
            // Already consumed (e.g. the barcode service recognised a scan).
            if (ev.defaultPrevented || ev.isComposing) return;
            if (!this._pksaIsActive()) return;
            if (isEditableTarget(ev.target) && !shortcut.hasModifier && !shortcut.isFunctionKey) {
                return; // let inputs (search bar...) keep arrows, Enter, etc.
            }
            const handled = this._pksaRun(shortcut.action, ev);
            if (handled) {
                ev.preventDefault();
            }
        }
        _pksaOnKeyupCapture(ev) {
            const swallow = this._pksaSwallow;
            if (!swallow) return;
            if (ev.key === swallow.key && ev.timeStamp - swallow.at < SWALLOW_WINDOW_MS) {
                // The keydown already acted; don't let this keyup confirm a
                // popup that the action may have opened (PosPopupController
                // confirms on keyup Enter).
                ev.stopImmediatePropagation();
                ev.stopPropagation();
            }
            if (ev.key === swallow.key) {
                this._pksaSwallow = null;
            }
        }
        _pksaOnFocusin(ev) {
            const el = ev.target;
            if (el && el.matches && el.matches(CARD_SELECTOR)) {
                this._pksaMark(el);
            }
        }
        _pksaIsActive() {
            const pos = this.env.pos;
            if (pos.tempScreenIsShown) return false;
            const popups = document.querySelector('.popups');
            if (popups && !popups.hidden && popups.childElementCount) return false;
            return true;
        }
        /**
         * Dispatch an action. Returns true when the key was handled and its
         * browser default must be prevented.
         */
        _pksaRun(action, ev) {
            if (action in GRID_DIRECTIONS) {
                return this._pksaMoveGrid(GRID_DIRECTIONS[action]);
            }
            switch (action) {
                case 'orderline_prev':
                    return this._pksaMoveOrderline(-1);
                case 'orderline_next':
                    return this._pksaMoveOrderline(1);
                case 'activate_product':
                    return this._pksaActivateFocused(ev);
                case 'focus_search':
                    return this._pksaFocusSearch();
                case 'focus_grid':
                    return this._pksaFocusGrid();
                case 'go_payment':
                    this._onClickPay();
                    return true;
                case 'show_help':
                    this._pksaShowHelp();
                    return true;
                default:
                    return false;
            }
        }

        // ------------------------------------------------------------------
        // Product grid
        // ------------------------------------------------------------------
        _pksaCards() {
            return document.querySelectorAll(CARD_SELECTOR);
        }
        _pksaCurrentIndex(cards) {
            const active = document.activeElement;
            let ref = active && active.matches && active.matches(CARD_SELECTOR) ? active : null;
            if (!ref && this._pksaMarkedEl && this._pksaMarkedEl.isConnected) {
                ref = this._pksaMarkedEl;
            }
            if (!ref) return -1;
            return Array.prototype.indexOf.call(cards, ref);
        }
        _pksaGridMetrics(cards) {
            const list = cards[0].parentElement;
            const style = window.getComputedStyle(list);
            let columns = 0;
            if (style.display === 'grid' || style.display === 'inline-grid') {
                const tracks = style.gridTemplateColumns;
                if (tracks && tracks !== 'none') {
                    columns = tracks.trim().split(/\s+/).length;
                }
            }
            if (!columns) {
                columns = countColumns(cards, (el) => el.offsetTop);
            }
            return { columns, rtl: style.direction === 'rtl' };
        }
        _pksaMoveGrid(direction) {
            const cards = this._pksaCards();
            if (!cards.length) return false;
            const index = this._pksaCurrentIndex(cards);
            const { columns, rtl } = this._pksaGridMetrics(cards);
            const target = computeGridTarget({ count: cards.length, columns, index, direction, rtl });
            if (target >= 0) {
                this._pksaFocusCard(cards[target]);
            }
            return true;
        }
        _pksaFocusCard(el) {
            if (!el) return;
            this._pksaMark(el);
            if (document.activeElement !== el) {
                el.focus({ preventScroll: true });
            }
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        _pksaMark(el) {
            if (this._pksaMarkedEl === el) return;
            if (this._pksaMarkedEl) this._pksaMarkedEl.classList.remove(MARK_CLASS);
            el.classList.add(MARK_CLASS);
            this._pksaMarkedEl = el;
        }
        _pksaFocusGrid() {
            const cards = this._pksaCards();
            if (!cards.length) return false;
            const index = this._pksaCurrentIndex(cards);
            this._pksaFocusCard(cards[index >= 0 ? index : 0]);
            return true;
        }
        _pksaFocusSearch() {
            const input = document.querySelector(SEARCH_SELECTOR);
            if (!input) return false;
            input.focus();
            input.select();
            return true;
        }

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
            const product = this.env.pos.db.get_product_by_id(parseInt(active.dataset.productId, 10));
            if (!product) return false;
            this._pksaSwallow = { key: ev.key, at: ev.timeStamp };
            this._pksaQueue.push(() => this._pksaActivateProduct(product));
            return true;
        }
        /**
         * Exactly what a mouse click on the card does: ProductItem triggers
         * `click-product` with the product as detail, which ProductScreen
         * routes to `_clickProduct`. Any module extending `_clickProduct`
         * (packaging, lots, configurator, weighing...) is therefore honoured.
         */
        _pksaActivateProduct(product) {
            return this._clickProduct({ detail: product });
        }

        // ------------------------------------------------------------------
        // Order lines
        // ------------------------------------------------------------------
        _pksaMoveOrderline(step) {
            const order = this.currentOrder;
            if (!order) return false;
            const lines = order.get_orderlines();
            if (!lines.length) return true;
            const selected = order.get_selected_orderline();
            let index = selected ? lines.indexOf(selected) : -1;
            if (index < 0) {
                index = step > 0 ? -1 : lines.length;
            }
            const next = Math.max(0, Math.min(lines.length - 1, index + step));
            if (lines[next] !== selected) {
                order.select_orderline(lines[next]);
                NumberBuffer.reset();
                this._pksaScrollSelectedLine();
            }
            return true;
        }
        _pksaScrollSelectedLine() {
            requestAnimationFrame(() => {
                const el = document.querySelector('.order .orderline.selected');
                if (el) el.scrollIntoView({ block: 'nearest' });
            });
        }

        // ------------------------------------------------------------------
        // Help
        // ------------------------------------------------------------------
        _pksaShowHelp() {
            this.showPopup('PksaShortcutHelpPopup', {
                title: this.env._t('Keyboard Shortcuts'),
            });
        }
    };

    Registries.Component.extend(ProductScreen, PksaProductScreen);

    return PksaProductScreen;
});
