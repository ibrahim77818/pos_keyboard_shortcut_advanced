/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ConnectionLostError } from "@web/core/network/rpc_service";
import { _t } from "@web/core/l10n/translation";
import { useState } from "@odoo/owl";

export class PksaShortcutHelpPopup extends AbstractAwaitablePopup {
    static template = "pos_keyboard_shortcut_advanced.ShortcutHelpPopup";
    static defaultProps = {
        title: _t("Keyboard Shortcuts"),
        confirmText: _t("Close"),
        confirmKey: false, // Enter must not close it right after the F1 keyup
        cancelKey: "Escape",
    };

    setup() {
        super.setup();
        this.pos = usePos();
        this.state = useState({ rows: this._rows(), loading: false, message: "" });
    }
    _rows() {
        const registry = this.pos.pksaRegistry;
        if (!registry) {
            return [];
        }
        const grouped = new Map();
        for (const entry of registry.describe()) {
            if (!grouped.has(entry.action)) {
                grouped.set(entry.action, { action: entry.action, name: entry.name, keys: [] });
            }
            grouped.get(entry.action).keys.push(entry.display);
        }
        return [...grouped.values()];
    }
    async onClickReload() {
        this.state.loading = true;
        this.state.message = "";
        try {
            await this.pos.pksaReloadShortcuts();
            this.state.rows = this._rows();
            this.state.message = _t("Shortcuts reloaded from the server.");
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                this.state.message = _t("Offline: the current shortcuts are kept.");
            } else {
                throw error;
            }
        } finally {
            this.state.loading = false;
        }
    }
}
