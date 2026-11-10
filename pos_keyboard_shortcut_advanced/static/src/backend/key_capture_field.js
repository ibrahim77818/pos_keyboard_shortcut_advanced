/** @odoo-module **/
/**
 * Backend field widget: click the input and press a key; the key and its
 * modifiers (Ctrl / Alt / Shift) are written on the record. Typing is
 * disabled to avoid spelling mistakes in KeyboardEvent.key values.
 */
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

const { Component, useState } = owl;

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
    setup() {
        this.state = useState({ listening: false });
    }
    get placeholder() {
        return this.state.listening ? _t("Press a key…") : _t("Click, then press a key");
    }
    get displayValue() {
        const value = this.props.value || "";
        return value.length === 1 ? value.toUpperCase() : value;
    }
    onFocus() {
        this.state.listening = true;
    }
    onBlur() {
        this.state.listening = false;
    }
    async onKeydown(ev) {
        if (PASS_THROUGH.has(ev.key) || MODIFIER_KEYS.has(ev.key) || !ev.key) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const changes = {
            [this.props.name]: normalizeCapturedKey(ev.key),
        };
        const fields = this.props.record && this.props.record.fields;
        for (const [fname, flag] of [["ctrl_key", ev.ctrlKey], ["alt_key", ev.altKey], ["shift_key", ev.shiftKey]]) {
            if (fields && fname in fields) {
                changes[fname] = flag;
            }
        }
        if (this.props.record && this.props.record.update) {
            await this.props.record.update(changes);
        } else {
            this.props.update(changes[this.props.name]);
        }
    }
}
KeyCaptureField.template = "pos_keyboard_shortcut_advanced.KeyCaptureField";
KeyCaptureField.props = { ...standardFieldProps };
KeyCaptureField.supportedTypes = ["char"];
KeyCaptureField.displayName = "Key Capture";

registry.category("fields").add("pksa_key_capture", KeyCaptureField);
