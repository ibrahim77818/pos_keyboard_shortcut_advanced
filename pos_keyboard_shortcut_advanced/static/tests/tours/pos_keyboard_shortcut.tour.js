/** @odoo-module */

import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import { registry } from "@web/core/registry";

// ------------------------------------------------------------------
// DOM helpers (run inside tour steps, synchronous assertions)
// ------------------------------------------------------------------
const CARD = ".product-list article.product";

function cards() {
    return [...document.querySelectorAll(CARD)];
}
function nameOf(el) {
    return el ? el.querySelector(".product-name").textContent.trim() : null;
}
function focusedIndex() {
    return cards().indexOf(document.activeElement);
}
/** Independent column measurement (offsetTop based, not the module's code). */
function measuredColumns() {
    const list = cards();
    const top = list[0].offsetTop;
    let n = 0;
    while (n < list.length && Math.abs(list[n].offsetTop - top) <= 2) {
        n++;
    }
    return n;
}
function fail(msg) {
    throw new Error(`[pos_keyboard_shortcut_advanced] ${msg}`);
}
function press(key, opts = {}) {
    const target = document.activeElement || document.body;
    const init = Object.assign({ key, bubbles: true, cancelable: true }, opts);
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keyup", init));
}

// ------------------------------------------------------------------
// Step factories
// ------------------------------------------------------------------
function pressKey(key, times = 1) {
    return [
        {
            content: `press ${key} x${times}`,
            trigger: ".pos .product-list",
            run: () => {
                for (let i = 0; i < times; i++) {
                    press(key);
                }
            },
        },
    ];
}

/**
 * Press an arrow key and assert the focus landed where a human would expect
 * it, using geometry measured independently of the module.
 */
function gridMove(key) {
    return [
        {
            content: `grid: ${key} moves the focus spatially`,
            trigger: ".pos .product-list article.product",
            run: () => {
                const list = cards();
                const count = list.length;
                const cols = measuredColumns();
                const before = focusedIndex();
                const beforeEl = list[before];
                press(key);
                const after = focusedIndex();
                if (after < 0) {
                    fail(`${key}: no product card is focused`);
                }
                const afterEl = list[after];
                if (!afterEl.classList.contains("pksa-focused")) {
                    fail(`${key}: focused card is not marked`);
                }
                if (before < 0) {
                    if (after !== 0) {
                        fail(`${key}: first press must focus the first card, got ${after}`);
                    }
                    return;
                }
                const rtl = getComputedStyle(list[0].parentElement).direction === "rtl";
                let expected;
                switch (key) {
                    case "ArrowRight":
                        expected = rtl ? Math.max(before - 1, 0) : Math.min(before + 1, count - 1);
                        break;
                    case "ArrowLeft":
                        expected = rtl ? Math.min(before + 1, count - 1) : Math.max(before - 1, 0);
                        break;
                    case "ArrowDown":
                        expected =
                            before + cols < count
                                ? before + cols
                                : Math.floor(before / cols) < Math.floor((count - 1) / cols)
                                ? count - 1
                                : before;
                        break;
                    case "ArrowUp":
                        expected = before - cols >= 0 ? before - cols : before;
                        break;
                }
                if (after !== expected) {
                    fail(`${key}: from ${before} expected ${expected}, got ${after} (cols=${cols})`);
                }
                // Vertical moves by a full row must keep the visual column.
                if ((key === "ArrowDown" || key === "ArrowUp") && Math.abs(after - before) === cols) {
                    if (Math.abs(afterEl.offsetLeft - beforeEl.offsetLeft) > 2) {
                        fail(`${key}: column changed (${beforeEl.offsetLeft} -> ${afterEl.offsetLeft})`);
                    }
                    if ((key === "ArrowDown") !== afterEl.offsetTop > beforeEl.offsetTop) {
                        fail(`${key}: moved in the wrong vertical direction`);
                    }
                }
            },
        },
    ];
}

/** 20 arrows in one synchronous burst must clamp at the grid edge. */
function burstToEdge(key, expectedName) {
    return [
        {
            content: `burst ${key} x20 clamps on ${expectedName}`,
            trigger: ".pos .product-list article.product.pksa-focused",
            run: () => {
                for (let i = 0; i < 20; i++) {
                    press(key);
                }
                const name = nameOf(document.activeElement);
                if (name !== expectedName) {
                    fail(`burst ${key}: expected ${expectedName}, got ${name}`);
                }
            },
        },
    ];
}

function focusSearchAndCheckArrowsIgnored() {
    return [
        {
            content: "F2 focuses the search bar; arrows inside it do not move the grid",
            trigger: ".pos .product-list article.product.pksa-focused",
            run: () => {
                const marked = document.querySelector(`${CARD}.pksa-focused`);
                press("F2");
                const active = document.activeElement;
                if (!active || active.tagName !== "INPUT") {
                    fail("F2 did not focus the search input");
                }
                press("ArrowDown");
                if (document.activeElement !== active) {
                    fail("ArrowDown left the search input");
                }
                if (document.querySelector(`${CARD}.pksa-focused`) !== marked) {
                    fail("grid cursor moved while typing in the search input");
                }
                // F3 brings the keyboard back to the grid, on the same card
                press("F3");
                if (document.activeElement !== marked) {
                    fail("F3 did not return to the last focused card");
                }
            },
        },
    ];
}

function focusedProductIs(name) {
    return [
        {
            content: `focused product card is '${name}'`,
            trigger: `.pos .product-list article.product.pksa-focused .product-name:contains("${name}")`,
            run: () => {
                const actual = nameOf(document.activeElement);
                if (actual !== name) {
                    fail(`expected focus on ${name}, got ${actual}`);
                }
            },
        },
    ];
}

registry.category("web_tour.tours").add("PosKeyboardShortcutAdvancedTour", {
    steps: () =>
        [
            Chrome.startPoS(),
            ProductScreen.clickSubcategory("PKSA Grid"),

            // ---------------- 2D grid traversal ----------------
            gridMove("ArrowRight"), // nothing focused -> first card
            focusedProductIs("PKSA 01"),
            gridMove("ArrowRight"),
            focusedProductIs("PKSA 02"),
            gridMove("ArrowLeft"),
            focusedProductIs("PKSA 01"),
            gridMove("ArrowLeft"), // clamped at the first card
            focusedProductIs("PKSA 01"),
            gridMove("ArrowDown"),
            gridMove("ArrowDown"),
            gridMove("ArrowUp"),
            gridMove("ArrowUp"),
            gridMove("ArrowRight"),
            gridMove("ArrowDown"),
            gridMove("ArrowUp"),
            burstToEdge("ArrowRight", "PKSA 08"),
            burstToEdge("ArrowLeft", "PKSA 01"),
            focusSearchAndCheckArrowsIgnored(),
            focusedProductIs("PKSA 01"),

            // ---------------- Enter == mouse click ----------------
            pressKey("Enter"),
            ProductScreen.selectedOrderlineHas("PKSA 01", "1.0"),
            pressKey("Enter"),
            ProductScreen.selectedOrderlineHas("PKSA 01", "2.0"),

            // ---------------- high-speed Enter burst ----------------
            pressKey("Enter", 10),
            ProductScreen.selectedOrderlineHas("PKSA 01", "12.0"),

            // second line through the keyboard only
            gridMove("ArrowRight"),
            focusedProductIs("PKSA 02"),
            pressKey("Enter"),
            ProductScreen.selectedOrderlineHas("PKSA 02", "1.0"),

            // ---------------- PageUp / PageDown order lines ----------------
            pressKey("PageUp"),
            ProductScreen.selectedOrderlineHas("PKSA 01", "12.0"),
            pressKey("PageUp"), // clamped on the first line
            ProductScreen.selectedOrderlineHas("PKSA 01", "12.0"),
            pressKey("PageDown"),
            ProductScreen.selectedOrderlineHas("PKSA 02", "1.0"),
            pressKey("PageDown"), // clamped on the last line
            ProductScreen.selectedOrderlineHas("PKSA 02", "1.0"),
            pressKey("PageUp", 5), // burst
            ProductScreen.selectedOrderlineHas("PKSA 01", "12.0"),

            // Enter after a line change still adds the focused card (PKSA 02)
            pressKey("Enter"),
            ProductScreen.selectedOrderlineHas("PKSA 02", "2.0"),
        ].flat(),
});
