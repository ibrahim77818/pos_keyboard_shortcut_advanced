# POS Keyboard Shortcuts & Grid Navigation (`pos_keyboard_shortcut_advanced`)

Odoo 17 · Community & Enterprise · depends only on `point_of_sale`

## Default key map

| Key | Action |
|---|---|
| ← ↑ → ↓ | Move the focus cursor across the product grid (2D, RTL aware) |
| Enter | On a focused product card: same as a mouse click (adds 1, then +1 per press) |
| PageUp / PageDown | Select previous / next order line |
| F2 / F3 | Focus product search / back to the grid |
| F9 | Payment (same checks as the Payment button) |
| F1 | Shortcut cheat-sheet popup (with live **Reload** from server) |

## Configuration

*Point of Sale › Configuration › Keyboard Shortcuts*

* Click the **Key** cell and press the key: key + Ctrl/Alt/Shift are captured.
* **Suggest Free Key** (magic wand) picks the first valid, conflict-free combo.
* **Restore Default** / **Reset All to Defaults**.
* Leave *Point of Sale* empty for a global shortcut. A shortcut bound to a POS
  replaces the global shortcuts of the same action for that POS.
* Per-POS master switch: *Settings › Point of Sale › Keyboard Shortcuts*.

Validation rules (enforced server side):

* Letters/digits/symbols need Ctrl or Alt (they would clash with barcode
  scanners and the numpad buffer).
* Backspace, Delete, Tab, Escape, Space need Ctrl or Alt.
* Plain Enter is only allowed for *Add Focused Product*.
* Browser-reserved combos (F5, F11, F12, Ctrl+R/W/T/N…) are refused.
* No two active shortcuts may share a combo on overlapping POS scopes.

## Design notes

* **One window listener set per mounted ProductScreen**, attached in
  `onMounted`, removed in `onWillUnmount`; re-renders never re-bind
  (`ListenerStats` proves it in QUnit).
* Key registry is a frozen `Map` (`combo → action`), marked raw (outside OWL
  reactivity): one `Map.get` per keydown, unmapped keys exit immediately.
* Column count read from the CSS grid track list (O(1)); falls back to
  measuring the first row if another module changes the layout.
* Enter calls `pos.addProductToCurrentOrder(product)` — the exact
  handler the product card's click calls — so every extension of it
  (packaging, lots, configurator, scale…) applies, including
  `pos_order_line_packaging_visuals`.
* Rapid Enter presses go through a FIFO queue: N presses → N increments,
  no race. Auto-repeat (held Enter) is ignored.
* Scanner-safe: if the barcode service already consumed the Enter
  (`defaultPrevented`) or a fast printable burst preceded it, the shortcut
  stands down.
* The keyup of a handled Enter is swallowed so it cannot confirm a popup
  opened by the click (lot/serial, product configurator).
* Inputs keep arrows/Enter; only Ctrl/Alt combos and F-keys work inside them.

## Tests

```bash
# Python (constraints, suggestion engine, per-POS loader) + tour + QUnit
odoo-bin -d <db> -i pos_keyboard_shortcut_advanced \
  --test-tags /pos_keyboard_shortcut_advanced --stop-after-init
```

* `tests/test_pos_keyboard_shortcut.py` – model rules, scopes, suggestions, loader.
* `static/tests/tours/pos_keyboard_shortcut.tour.js` – 8-product grid: spatial
  arrow moves verified against measured geometry, edge clamping under 20-key
  bursts, F2/F3 focus, Enter = click, 10× Enter burst → qty 12, PageUp/PageDown.
* `static/tests/unit/test_pos_keyboard_shortcut.js` – QUnit: registry, grid math
  (exhaustive 25×8), partial rows, RTL, scan guard, serial queue (40 jittered
  async increments), listener leak/duplication across 3 mount cycles × 25 renders.
  Also runnable from *POS › debug › Run Point of Sale JS Tests*.
