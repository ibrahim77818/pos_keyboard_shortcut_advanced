# POS Keyboard Shortcuts & Grid Navigation

`pos_keyboard_shortcut_advanced` — keyboard-first Odoo Point of Sale: arrow keys move across the product grid, **Enter** adds the focused product exactly like a mouse click, **PageUp / PageDown** select order lines, and every key is configurable from the backend. Community & Enterprise, English & Arabic.

## Branches / supported versions

| Branch | Odoo version |
|---|---|
| [`16.0`](../../tree/16.0) (default) | Odoo 16 |
| [`17.0`](../../tree/17.0) | Odoo 17 |
| [`18.0`](../../tree/18.0) | Odoo 18 |
| [`19.0`](../../tree/19.0) | Odoo 19 |

Each branch contains the module ported to that version (`pos_keyboard_shortcut_advanced/`).

## Default key map

| Key | Action |
|---|---|
| ← ↑ → ↓ | Move the focus cursor across the product grid (2D, RTL aware) |
| Enter | On a focused product card: same as a mouse click (adds 1, +1 per press) |
| PageUp / PageDown | Select previous / next order line |
| F2 / F3 | Focus product search / back to the grid |
| F9 | Payment |
| F1 | Shortcut cheat sheet (with live Reload) |

Keys are managed in **Point of Sale › Configuration › Keyboard Shortcuts** (click the Key cell and press a key; *Suggest Free Key*, *Restore Default*, per-POS overrides). Each POS has an on/off switch in **Settings**.

## Installation

1. Clone the branch matching your Odoo version into your addons path:
   ```bash
   git clone -b 16.0 https://github.com/ibrahim77818/pos_keyboard_shortcut_advanced.git
   ```
   (use `17.0`, `18.0` or `19.0` for other versions)
2. Add the cloned folder to `addons_path` and restart Odoo.
3. Update the Apps list and install **POS Keyboard Shortcuts & Grid Navigation**, or:
   ```bash
   odoo-bin -c <your.conf> -d <db> -i pos_keyboard_shortcut_advanced --stop-after-init
   ```

Depends only on `point_of_sale`. Tests: `--test-tags /pos_keyboard_shortcut_advanced`.

## Author

Ibrahim Yahia — [LinkedIn](https://www.linkedin.com/in/ibrahim-yahia) · License: LGPL-3
