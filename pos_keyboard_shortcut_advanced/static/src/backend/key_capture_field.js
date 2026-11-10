/** @odoo-module **/
/**
 * Backend field widget: click the input and press a key; the key and its
 * modifiers (Ctrl / Alt / Shift) are written on the record. Typing is
 * disabled to avoid spelling mistakes in KeyboardEvent.key values.
 */
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component, useState } from "@odoo/owl";

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock"]);
// Keys that keep their normal behaviour inside the form (navigation).
const PASS_THROUGH = new Set(["Tab"]);

export function normalizeCapturedKey(key) {
    if (key === " ") {
        return "Space";
    }
    if (key && key.length === 1) {
        return key.toLowerCase();
    }
    return key;
}

export class KeyCaptureField extends Component {
    static template = "pos_keyboard_shortcut_advanced.KeyCaptureField";
    static props = { ...standardFieldProps };

    setup() {
        this.state = useState({ listening: false });
    }
    get value() {
        return this.props.record.data[this.props.name] || "";
    }
    get placeholder() {
        return this.state.listening ? _t("Press a key…") : _t("Click, then press a key");
    }
    get displayValue() {
        const value = this.value;
        return value.length === 1 ? value.toUpperCase() : value;
    }
    onFocus() {
        this.state.listening = true;
    }
    onBlur() {
        this.state.listening = false;
    }
    async onKeydown(ev) {
        if (!ev.key || PASS_THROUGH.has(ev.key) || MODIFIER_KEYS.has(ev.key)) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const changes = { [this.props.name]: normalizeCapturedKey(ev.key) };
        const fields = this.props.record.fields;
        for (const [fname, flag] of [
            ["ctrl_key", ev.ctrlKey],
            ["alt_key", ev.altKey],
            ["shift_key", ev.shiftKey],
        ]) {
            if (fname in fields) {
                changes[fname] = flag;
            }
        }
        await this.props.record.update(changes);
    }
}

export const keyCaptureField = {
    component: KeyCaptureField,
    displayName: _t("Key Capture"),
    supportedTypes: ["char"],
};

registry.category("fields").add("pksa_key_capture", keyCaptureField);
