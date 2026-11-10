odoo.define('pos_keyboard_shortcut_advanced.ShortcutHelpPopup', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const { isConnectionError } = require('point_of_sale.utils');
    const { _lt } = require('@web/core/l10n/translation');
    const { useState } = owl;

    class PksaShortcutHelpPopup extends AbstractAwaitablePopup {
        setup() {
            super.setup();
            this.state = useState({
                rows: this._rows(),
                loading: false,
                message: '',
            });
        }
        _rows() {
            const registry = this.env.pos.pksaRegistry;
            if (!registry) return [];
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
            this.state.message = '';
            try {
                await this.env.pos.pksaReloadShortcuts();
                this.state.rows = this._rows();
                this.state.message = this.env._t('Shortcuts reloaded from the server.');
            } catch (error) {
                if (isConnectionError(error)) {
                    this.state.message = this.env._t('Offline: the current shortcuts are kept.');
                } else {
                    throw error;
                }
            } finally {
                this.state.loading = false;
            }
        }
    }
    PksaShortcutHelpPopup.template = 'pos_keyboard_shortcut_advanced.ShortcutHelpPopup';
    PksaShortcutHelpPopup.defaultProps = {
        title: _lt('Keyboard Shortcuts'),
        confirmText: _lt('Close'),
        confirmKey: false, // Enter must not close it right after F1's keyup
        cancelKey: 'Escape',
    };

    Registries.Component.add(PksaShortcutHelpPopup);

    return PksaShortcutHelpPopup;
});
