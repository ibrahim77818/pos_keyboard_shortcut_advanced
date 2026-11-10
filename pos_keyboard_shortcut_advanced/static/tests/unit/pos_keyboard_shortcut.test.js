import { describe, expect, getFixture, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { App, Component, useState, xml } from "@odoo/owl";
import {
    normalizeKey,
    comboFromEvent,
    comboFromParts,
    displayCombo,
    KeyRegistry,
    DEFAULT_SHORTCUTS,
    countColumns,
    computeGridTarget,
    computeSectionedTarget,
    effectiveShortcuts,
    ScanGuard,
    SerialQueue,
    isEditableTarget,
    ListenerStats,
    useWindowKeyListeners,
} from "@pos_keyboard_shortcut_advanced/app/shortcut_utils";

const ev = (key, mods = {}) =>
    Object.assign({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, mods);
// Hoot mocks timers: jitter with microtasks instead of setTimeout.
const ticks = async (n) => {
    for (let i = 0; i < n; i++) {
        await Promise.resolve();
    }
};

describe("pos_keyboard_shortcut_advanced", () => {
    describe("key normalisation & registry", () => {
        test("normalizeKey / combos", () => {
            expect(normalizeKey("pageup")).toBe("PageUp");
            expect(normalizeKey("ARROWLEFT")).toBe("ArrowLeft");
            expect(normalizeKey("Esc")).toBe("Escape");
            expect(normalizeKey(" ")).toBe("Space");
            expect(normalizeKey("A")).toBe("a");
            expect(normalizeKey("f2")).toBe("F2");
            expect(comboFromParts("s", true, true, false)).toBe("ctrl+alt+s");
            expect(comboFromEvent(ev("A", { shiftKey: true, altKey: true }))).toBe("alt+shift+a");
            expect(comboFromEvent(ev("ArrowUp", { metaKey: true }))).toBe("ctrl+ArrowUp");
            expect(displayCombo("ctrl+alt+s")).toBe("Ctrl+Alt+S");
        });

        test("KeyRegistry: O(1) lookup, sequence priority, modifiers", () => {
            const registry = new KeyRegistry([
                { id: 2, action: "grid_up", key: "ArrowUp", sequence: 20 },
                { id: 1, action: "orderline_prev", key: "ArrowUp", sequence: 10 },
                { id: 3, action: "focus_search", key: "s", alt_key: true, sequence: 30 },
                { id: 4, action: "go_payment", key: "", sequence: 40 },
            ]);
            expect(registry.size).toBe(2);
            expect(registry.lookup(ev("ArrowUp")).action).toBe("orderline_prev");
            expect(registry.lookup(ev("s", { altKey: true })).action).toBe("focus_search");
            expect(registry.lookup(ev("S", { altKey: true })).action).toBe("focus_search");
            expect(registry.lookup(ev("s"))).toBe(null);
            expect(registry.lookup(ev("ArrowUp", { ctrlKey: true }))).toBe(null);
            expect(registry.lookup(ev("s", { altKey: true })).hasModifier).toBe(true);
        });

        test("KeyRegistry: hot reload swaps the whole table", () => {
            const registry = new KeyRegistry(DEFAULT_SHORTCUTS);
            expect(registry.lookup(ev("PageUp")).action).toBe("orderline_prev");
            expect(registry.lookup(ev("Enter")).action).toBe("activate_product");
            registry.load([{ action: "orderline_prev", key: "ArrowUp", alt_key: true }]);
            expect(registry.lookup(ev("PageUp"))).toBe(null);
            expect(registry.lookup(ev("ArrowUp", { altKey: true })).action).toBe("orderline_prev");
            registry.load([]);
            expect(registry.size).toBe(0);
        });

        test("KeyRegistry: 100k lookups stay fast", () => {
            const registry = new KeyRegistry(DEFAULT_SHORTCUTS);
            const keys = ["ArrowUp", "ArrowDown", "a", "1", "PageDown", "Enter", "x", "F9"].map((k) => ev(k));
            const start = performance.now();
            let hits = 0;
            for (let i = 0; i < 100000; i++) {
                if (registry.lookup(keys[i % keys.length])) {
                    hits++;
                }
            }
            expect(hits).toBe(62500);
            expect(performance.now() - start).toBeLessThan(250);
        });
    });

    describe("2D grid navigation", () => {
        test("computeGridTarget on a full 4x3 grid", () => {
            const g = (index, direction) => computeGridTarget({ count: 12, columns: 4, index, direction });
            expect([g(-1, "down"), g(0, "right"), g(3, "right"), g(11, "right")]).toEqual([0, 1, 4, 11]);
            expect([g(0, "left"), g(4, "left"), g(1, "down"), g(5, "down")]).toEqual([0, 3, 5, 9]);
            expect([g(9, "down"), g(9, "up"), g(2, "up")]).toEqual([9, 5, 2]);
        });

        test("computeGridTarget with a partial last row", () => {
            const g = (index, direction) => computeGridTarget({ count: 10, columns: 4, index, direction });
            expect([g(5, "down"), g(6, "down"), g(7, "down"), g(9, "up"), g(8, "down")]).toEqual([
                9, 9, 9, 5, 8,
            ]);
        });

        test("computeGridTarget: RTL, single column, empty, bad columns", () => {
            expect(computeGridTarget({ count: 6, columns: 3, index: 1, direction: "left", rtl: true })).toBe(2);
            expect(computeGridTarget({ count: 6, columns: 3, index: 1, direction: "right", rtl: true })).toBe(0);
            expect(computeGridTarget({ count: 5, columns: 1, index: 2, direction: "down" })).toBe(3);
            expect(computeGridTarget({ count: 0, columns: 4, index: 0, direction: "down" })).toBe(-1);
            expect(computeGridTarget({ count: 3, columns: 0, index: 0, direction: "down" })).toBe(1);
            expect(computeGridTarget({ count: 3, columns: 99, index: 0, direction: "down" })).toBe(0);
        });

        test("exhaustive traversal never leaves the grid", () => {
            let violations = 0;
            for (let count = 1; count <= 25; count++) {
                for (let columns = 1; columns <= 8; columns++) {
                    for (let index = 0; index < count; index++) {
                        for (const direction of ["up", "down", "left", "right"]) {
                            const t = computeGridTarget({ count, columns, index, direction });
                            const c = Math.min(columns, count);
                            if (t < 0 || t >= count) {
                                violations++;
                            }
                            if (direction === "up" && t !== index && t !== index - c) {
                                violations++;
                            }
                            if (direction === "down" && t !== index && t < index) {
                                violations++;
                            }
                        }
                    }
                }
            }
            expect(violations).toBe(0);
        });

        test("countColumns measures the first row on real DOM", () => {
            const target = getFixture();
            target.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(3,50px);gap:2px;width:160px">
                    ${'<article class="product" style="height:20px"></article>'.repeat(7)}
                </div>`;
            const items = target.querySelectorAll("article");
            expect(countColumns(items, (el) => el.offsetTop)).toBe(3);
            expect(countColumns([], () => 0)).toBe(0);
            expect(countColumns([{ t: 0 }], (o) => o.t)).toBe(1);
        });
    });

    describe("grouped grids (Odoo 19 products by category)", () => {
        test("single section behaves exactly like one grid", () => {
            let mismatches = 0;
            for (let count = 1; count <= 25; count++) {
                for (let columns = 1; columns <= 8; columns++) {
                    for (let index = -1; index < count; index++) {
                        for (const direction of ["up", "down", "left", "right"]) {
                            const a = computeGridTarget({ count, columns, index, direction });
                            const b = computeSectionedTarget({
                                sections: [{ count, columns }],
                                index,
                                direction,
                            });
                            if (a !== b) {
                                mismatches++;
                            }
                        }
                    }
                }
            }
            expect(mismatches).toBe(0);
        });

        test("up/down cross into the neighbouring category, keeping the column", () => {
            // A: 5 cards x4 cols (0-3 | 4), B: 6 cards x4 (5-8 | 9-10), C: 2 cards (11-12)
            const sections = [
                { count: 5, columns: 4 },
                { count: 6, columns: 4 },
                { count: 2, columns: 4 },
            ];
            const g = (index, direction) => computeSectionedTarget({ sections, index, direction });
            expect([g(2, "down"), g(4, "down"), g(1, "down")]).toEqual([4, 5, 4]);
            expect([g(5, "up"), g(7, "up"), g(9, "up"), g(10, "down"), g(8, "down")]).toEqual([
                4, 4, 5, 12, 10,
            ]);
            expect([g(12, "up"), g(11, "up"), g(12, "down")]).toEqual([10, 9, 12]);
            expect([g(4, "right"), g(5, "left"), g(12, "right")]).toEqual([5, 4, 12]);
        });
    });

    describe("per-POS overrides (applied on the cached records)", () => {
        test("a POS-bound shortcut replaces the global one of the same action", () => {
            const records = [
                { action: "go_payment", key: "F9", config_ids: [] },
                { action: "go_payment", key: "F8", config_ids: [{ id: 7 }] },
                { action: "show_help", key: "F1", config_ids: [] },
                { action: "focus_grid", key: "F3", config_ids: [3] },
                { action: "grid_up", key: "ArrowUp", config_ids: [], active: false },
            ];
            expect(effectiveShortcuts(records, 7).map((r) => r.key)).toEqual(["F8", "F1"]);
            expect(effectiveShortcuts(records, 3).map((r) => r.key)).toEqual(["F9", "F1", "F3"]);
            expect(effectiveShortcuts([], 3)).toEqual([]);
        });
    });

    describe("barcode scanner safety", () => {
        test("ScanGuard recognises a scanner burst", () => {
            const guard = new ScanGuard(100, 3);
            let t = 1000;
            for (const k of "5449") {
                guard.record({ key: k, timeStamp: (t += 10) });
            }
            expect(guard.isScanning(t + 10)).toBe(true);
            expect(guard.isScanning(t + 500)).toBe(false);
            guard.reset();
            guard.record({ key: "5", timeStamp: 1000 });
            guard.record({ key: "4", timeStamp: 1400 });
            expect(guard.isScanning(1410)).toBe(false);
            guard.reset();
            guard.record({ key: "a", ctrlKey: true, timeStamp: 1 });
            guard.record({ key: "ArrowUp", timeStamp: 2 });
            expect(guard.run).toBe(0);
        });

        test("isEditableTarget", () => {
            const ce = document.createElement("div");
            ce.setAttribute("contenteditable", "true");
            expect(isEditableTarget(document.createElement("input"))).toBe(true);
            expect(isEditableTarget(ce)).toBe(true);
            expect(isEditableTarget(document.createElement("div"))).toBe(false);
            expect(isEditableTarget(null)).toBe(false);
        });
    });

    describe("high-speed input (serial queue)", () => {
        test("N rapid Enter presses -> exactly N ordered increments", async () => {
            const queue = new SerialQueue({ maxPending: 100 });
            const order = { qty: 0, log: [] };
            const click = (i) => async () => {
                const before = order.qty;
                await ticks(i % 3);
                order.qty = before + 1; // would lose updates if run concurrently
                order.log.push(i);
            };
            for (let i = 0; i < 40; i++) {
                queue.push(click(i));
            }
            await queue.idle;
            expect(order.qty).toBe(40);
            expect(order.log).toEqual([...Array(40).keys()]);
        });

        test("a failing action does not break the chain; back-pressure cap", async () => {
            const queue = new SerialQueue({ maxPending: 3 });
            const done = [];
            const failing = queue.push(async () => {
                throw new Error("boom");
            });
            queue.push(async () => done.push("a"));
            queue.push(async () => done.push("b"));
            expect(queue.push(async () => done.push("dropped"))).toBe(null);
            await expect(failing).rejects.toThrow("boom");
            await queue.idle;
            expect(done).toEqual(["a", "b"]);
            queue.push(async () => done.push("c"));
            await queue.idle;
            expect(done).toEqual(["a", "b", "c"]);
        });
    });

    describe("lifecycle / memory safety", () => {
        test("listeners bound once per mount, removed on unmount, no duplication on re-render", async () => {
            const target = getFixture();
            const calls = { keydown: 0, keyup: 0 };
            const baseActive = ListenerStats.active;
            const baseAttach = ListenerStats.attachCount;

            class Root extends Component {
                static template = xml`<div class="pksa-root"><t t-esc="state.n"/></div>`;
                static props = {};
                setup() {
                    this.state = useState({ n: 0 });
                    useWindowKeyListeners({
                        keydown: () => calls.keydown++,
                        keyupCapture: () => calls.keyup++,
                    });
                }
            }
            const fire = () => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
                window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp" }));
            };

            for (let cycle = 0; cycle < 3; cycle++) {
                const app = new App(Root, { test: true });
                const comp = await app.mount(target);
                expect(ListenerStats.active).toBe(baseActive + 1);
                for (let i = 0; i < 25; i++) {
                    comp.state.n++;
                    await animationFrame();
                }
                calls.keydown = calls.keyup = 0;
                fire();
                expect(calls).toEqual({ keydown: 1, keyup: 1 });
                app.destroy();
                expect(ListenerStats.active).toBe(baseActive);
                calls.keydown = calls.keyup = 0;
                fire();
                expect(calls).toEqual({ keydown: 0, keyup: 0 });
            }
            expect(ListenerStats.attachCount - baseAttach).toBe(3);
        });
    });
});
