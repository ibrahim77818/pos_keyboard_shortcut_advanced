/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
import { markRaw } from "@odoo/owl";
import { KeyRegistry, DEFAULT_SHORTCUTS } from "@pos_keyboard_shortcut_advanced/app/shortcut_utils";

patch(PosStore.prototype, {
    async _processData(loadedData) {
        await super._processData(...arguments);
        const records = loadedData["pos.keyboard.shortcut"];
        // markRaw: the registry is read on every keydown; keep it out of
        // OWL's reactivity so lookups stay a plain Map.get().
        this.pksaRegistry = markRaw(new KeyRegistry());
        if (this.config.pksa_enabled === false) {
            return;
        }
        // `undefined` means the loader did not run: fall back to the factory
        // map. An empty list means every shortcut was disabled.
        this.pksaRegistry.load(records === undefined ? DEFAULT_SHORTCUTS : records);
    },
    /**
     * Fetch the current key map from the server and swap it in place,
     * without reloading the POS.
     */
    async pksaReloadShortcuts() {
        const records = await this.orm.call("pos.keyboard.shortcut", "get_pos_keyboard_shortcuts", [
            this.config.id,
        ]);
        this.pksaRegistry.load(records);
        return this.pksaRegistry;
    },
});
