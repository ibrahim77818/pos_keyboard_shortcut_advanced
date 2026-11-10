/** @odoo-module */

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { markRaw } from "@odoo/owl";
import {
    KeyRegistry,
    DEFAULT_SHORTCUTS,
    effectiveShortcuts,
} from "@pos_keyboard_shortcut_advanced/app/shortcut_utils";

patch(PosStore.prototype, {
    async processServerData() {
        await super.processServerData(...arguments);
        // markRaw: the registry is read on every keydown; keep it out of
        // OWL's reactivity so lookups stay a plain Map.get().
        this.pksaRegistry = markRaw(new KeyRegistry());
        if (this.config.pksa_enabled === false) {
            return;
        }
        const model = this.models["pos.keyboard.shortcut"];
        // No model means the loader did not run: fall back to the factory
        // map. An empty list means every shortcut was disabled.
        // Odoo 19 keeps a local cache, so the "POS-specific replaces global"
        // rule is applied here on whatever the cache holds.
        this.pksaRegistry.load(
            model ? effectiveShortcuts(model.getAll(), this.config.id) : DEFAULT_SHORTCUTS
        );
    },
    /**
     * Fetch the current key map from the server and swap it in place,
     * without reloading the POS.
     */
    async pksaReloadShortcuts() {
        const records = await this.data.call("pos.keyboard.shortcut", "get_pos_keyboard_shortcuts", [
            this.config.id,
        ]);
        this.pksaRegistry.load(effectiveShortcuts(records, this.config.id));
        return this.pksaRegistry;
    },
});
