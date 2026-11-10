odoo.define('pos_keyboard_shortcut_advanced.models', function (require) {
    'use strict';

    const { PosGlobalState } = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const { KeyRegistry, DEFAULT_SHORTCUTS } = require('pos_keyboard_shortcut_advanced.utils');
    const { markRaw } = owl;

    const PksaPosGlobalState = (PosGlobalState) => class PksaPosGlobalState extends PosGlobalState {
        async _processData(loadedData) {
            await super._processData(...arguments);
            const records = loadedData['pos.keyboard.shortcut'];
            // markRaw: the registry is read on every keydown; keep it out of
            // OWL's reactivity system so lookups stay a plain Map.get().
            this.pksaRegistry = markRaw(new KeyRegistry());
            if (this.config.pksa_enabled === false) {
                return;
            }
            // `undefined` means the loader did not run (e.g. tests without the
            // server part): fall back to the factory map. An empty list means
            // the administrator disabled every shortcut and is respected.
            this.pksaRegistry.load(records === undefined ? DEFAULT_SHORTCUTS : records);
        }
        /**
         * Fetch the current key map from the server and swap it in place,
         * without reloading the POS.
         */
        async pksaReloadShortcuts() {
            const records = await this.env.services.rpc({
                model: 'pos.keyboard.shortcut',
                method: 'get_pos_keyboard_shortcuts',
                args: [this.config.id],
            });
            this.pksaRegistry.load(records);
            return this.pksaRegistry;
        }
    };
    Registries.Model.extend(PosGlobalState, PksaPosGlobalState);

    return PksaPosGlobalState;
});
