/** @odoo-module */

import {
    normalizeKey,
    comboFromEvent,
    comboFromParts,
    displayCombo,
    KeyRegistry,
    DEFAULT_SHORTCUTS,
    countColumns,
    computeGridTarget,
    ScanGuard,
    SerialQueue,
    isEditableTarget,
    ListenerStats,
    useWindowKeyListeners,
} from "@pos_keyboard_shortcut_advanced/app/shortcut_utils";
import { makeTestEnv } from "@web/../tests/helpers/mock_env";
import { destroy, getFixture, mount, nextTick } from "@web/../tests/helpers/utils";
import { Component, useState, xml } from "@odoo/owl";

const ev = (key, mods = {}) =>
    Object.assign({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, mods);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

QUnit.module('pos_keyboard_shortcut_advanced', {}, function () {
    // --------------------------------------------------------------
    QUnit.module('key normalisation & registry');

    QUnit.test('normalizeKey / combos', function (assert) {
        assert.strictEqual(normalizeKey('pageup'), 'PageUp');
        assert.strictEqual(normalizeKey('ARROWLEFT'), 'ArrowLeft');
        assert.strictEqual(normalizeKey('Esc'), 'Escape');
        assert.strictEqual(normalizeKey(' '), 'Space');
        assert.strictEqual(normalizeKey('A'), 'a');
        assert.strictEqual(normalizeKey('f2'), 'F2');
        assert.strictEqual(comboFromParts('s', true, true, false), 'ctrl+alt+s');
        assert.strictEqual(comboFromEvent(ev('A', { shiftKey: true, altKey: true })), 'alt+shift+a');
        assert.strictEqual(comboFromEvent(ev('ArrowUp', { metaKey: true })), 'ctrl+ArrowUp',
            'Cmd is treated as Ctrl');
        assert.strictEqual(displayCombo('ctrl+alt+s'), 'Ctrl+Alt+S');
    });

    QUnit.test('KeyRegistry: O(1) lookup, sequence priority, modifiers', function (assert) {
        const registry = new KeyRegistry([
            { id: 2, action: 'grid_up', key: 'ArrowUp', sequence: 20 },
            { id: 1, action: 'orderline_prev', key: 'ArrowUp', sequence: 10 }, // same combo, wins
            { id: 3, action: 'focus_search', key: 's', alt_key: true, sequence: 30 },
            { id: 4, action: 'go_payment', key: '', sequence: 40 }, // invalid -> ignored
        ]);
        assert.strictEqual(registry.size, 2);
        assert.strictEqual(registry.lookup(ev('ArrowUp')).action, 'orderline_prev');
        assert.strictEqual(registry.lookup(ev('s', { altKey: true })).action, 'focus_search');
        assert.strictEqual(registry.lookup(ev('S', { altKey: true })).action, 'focus_search',
            'case-insensitive letters');
        assert.strictEqual(registry.lookup(ev('s')), null, 'no modifier: no match');
        assert.strictEqual(registry.lookup(ev('ArrowUp', { ctrlKey: true })), null);
        assert.ok(registry.lookup(ev('s', { altKey: true })).hasModifier);
    });

    QUnit.test('KeyRegistry: hot reload swaps the whole table', function (assert) {
        const registry = new KeyRegistry(DEFAULT_SHORTCUTS);
        assert.strictEqual(registry.lookup(ev('PageUp')).action, 'orderline_prev');
        assert.strictEqual(registry.lookup(ev('Enter')).action, 'activate_product');
        registry.load([{ action: 'orderline_prev', key: 'ArrowUp', alt_key: true }]);
        assert.strictEqual(registry.lookup(ev('PageUp')), null, 'old mapping gone');
        assert.strictEqual(registry.lookup(ev('ArrowUp', { altKey: true })).action, 'orderline_prev');
        registry.load([]);
        assert.strictEqual(registry.size, 0, 'empty list disables everything');
    });

    QUnit.test('KeyRegistry: 100k lookups stay fast', function (assert) {
        const registry = new KeyRegistry(DEFAULT_SHORTCUTS);
        const keys = ['ArrowUp', 'ArrowDown', 'a', '1', 'PageDown', 'Enter', 'x', 'F9'].map((k) => ev(k));
        const start = performance.now();
        let hits = 0;
        for (let i = 0; i < 100000; i++) {
            if (registry.lookup(keys[i % keys.length])) hits++;
        }
        const elapsed = performance.now() - start;
        assert.strictEqual(hits, 62500);
        assert.ok(elapsed < 250, `100k lookups took ${elapsed.toFixed(1)}ms`);
    });

    // --------------------------------------------------------------
    QUnit.module('2D grid navigation');

    QUnit.test('computeGridTarget on a full 4x3 grid', function (assert) {
        const g = (index, direction) => computeGridTarget({ count: 12, columns: 4, index, direction });
        assert.strictEqual(g(-1, 'down'), 0, 'nothing focused -> first card');
        assert.strictEqual(g(0, 'right'), 1);
        assert.strictEqual(g(3, 'right'), 4, 'wraps to next row in reading order');
        assert.strictEqual(g(11, 'right'), 11, 'clamped at the end');
        assert.strictEqual(g(0, 'left'), 0, 'clamped at the start');
        assert.strictEqual(g(4, 'left'), 3);
        assert.strictEqual(g(1, 'down'), 5);
        assert.strictEqual(g(5, 'down'), 9);
        assert.strictEqual(g(9, 'down'), 9, 'last row: stays');
        assert.strictEqual(g(9, 'up'), 5);
        assert.strictEqual(g(2, 'up'), 2, 'first row: stays');
    });

    QUnit.test('computeGridTarget with a partial last row', function (assert) {
        // 4 columns, 10 cards: last row has 2 cards (8, 9)
        const g = (index, direction) => computeGridTarget({ count: 10, columns: 4, index, direction });
        assert.strictEqual(g(5, 'down'), 9, 'column 1 -> card 9');
        assert.strictEqual(g(6, 'down'), 9, 'no card below: jump to last card of the partial row');
        assert.strictEqual(g(7, 'down'), 9);
        assert.strictEqual(g(9, 'up'), 5);
        assert.strictEqual(g(8, 'down'), 8);
    });

    QUnit.test('computeGridTarget: RTL, single column, empty, bad columns', function (assert) {
        assert.strictEqual(computeGridTarget({ count: 6, columns: 3, index: 1, direction: 'left', rtl: true }), 2);
        assert.strictEqual(computeGridTarget({ count: 6, columns: 3, index: 1, direction: 'right', rtl: true }), 0);
        assert.strictEqual(computeGridTarget({ count: 5, columns: 1, index: 2, direction: 'down' }), 3);
        assert.strictEqual(computeGridTarget({ count: 0, columns: 4, index: 0, direction: 'down' }), -1);
        assert.strictEqual(computeGridTarget({ count: 3, columns: 0, index: 0, direction: 'down' }), 1,
            'columns < 1 is treated as 1');
        assert.strictEqual(computeGridTarget({ count: 3, columns: 99, index: 0, direction: 'down' }), 0,
            'columns > count is clamped');
    });

    QUnit.test('exhaustive traversal never leaves the grid', function (assert) {
        let violations = 0;
        for (let count = 1; count <= 25; count++) {
            for (let columns = 1; columns <= 8; columns++) {
                for (let index = 0; index < count; index++) {
                    for (const direction of ['up', 'down', 'left', 'right']) {
                        const t = computeGridTarget({ count, columns, index, direction });
                        if (t < 0 || t >= count) violations++;
                        const c = Math.min(columns, count);
                        if (direction === 'up' && t !== index && t !== index - c) violations++;
                        if (direction === 'down' && t !== index && t < index) violations++;
                    }
                }
            }
        }
        assert.strictEqual(violations, 0);
    });

    QUnit.test('countColumns measures the first row on real DOM', async function (assert) {
        const target = getFixture();
        target.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(3,50px);gap:2px;width:160px">
                ${'<article class="product" style="height:20px"></article>'.repeat(7)}
            </div>`;
        const items = target.querySelectorAll('article');
        assert.strictEqual(countColumns(items, (el) => el.offsetTop), 3);
        assert.strictEqual(countColumns([], () => 0), 0);
        assert.strictEqual(countColumns([{ t: 0 }], (o) => o.t), 1);
    });

    // --------------------------------------------------------------
    QUnit.module('barcode scanner safety');

    QUnit.test('ScanGuard recognises a scanner burst', function (assert) {
        const guard = new ScanGuard(100, 3);
        let t = 1000;
        for (const k of '5449') guard.record({ key: k, timeStamp: (t += 10) });
        assert.ok(guard.isScanning(t + 10), 'fast printable burst followed by Enter = scan');
        assert.notOk(guard.isScanning(t + 500), 'too late: a human Enter');

        guard.reset();
        guard.record({ key: '5', timeStamp: 1000 });
        guard.record({ key: '4', timeStamp: 1400 });
        assert.notOk(guard.isScanning(1410), 'slow typing is not a scan');

        guard.reset();
        guard.record({ key: 'a', ctrlKey: true, timeStamp: 1 });
        guard.record({ key: 'ArrowUp', timeStamp: 2 });
        assert.strictEqual(guard.run, 0, 'modifier and named keys are ignored');
    });

    QUnit.test('isEditableTarget', function (assert) {
        const input = document.createElement('input');
        const div = document.createElement('div');
        const ce = document.createElement('div');
        ce.setAttribute('contenteditable', 'true');
        assert.ok(isEditableTarget(input));
        assert.ok(isEditableTarget(ce));
        assert.notOk(isEditableTarget(div));
        assert.notOk(isEditableTarget(null));
    });

    // --------------------------------------------------------------
    QUnit.module('high-speed input (serial queue)');

    QUnit.test('N rapid Enter presses -> exactly N ordered increments', async function (assert) {
        const queue = new SerialQueue({ maxPending: 100 });
        const order = { qty: 0, log: [] };
        // async "click" with jittered latency, like _clickProduct awaiting popups/rpc
        const click = (i) => async () => {
            const before = order.qty;
            await sleep(i % 3);
            order.qty = before + 1; // would lose updates if run concurrently
            order.log.push(i);
        };
        for (let i = 0; i < 40; i++) queue.push(click(i));
        await queue.idle;
        assert.strictEqual(order.qty, 40, 'no lost increment');
        assert.deepEqual(order.log, [...Array(40).keys()], 'FIFO order');
    });

    QUnit.test('a failing action does not break the chain; back-pressure cap', async function (assert) {
        const queue = new SerialQueue({ maxPending: 3 });
        const done = [];
        const failing = queue.push(async () => { throw new Error('boom'); });
        queue.push(async () => done.push('a'));
        queue.push(async () => done.push('b'));
        assert.strictEqual(queue.push(async () => done.push('dropped')), null, 'over capacity');
        await assert.rejects(failing, /boom/);
        await queue.idle;
        assert.deepEqual(done, ['a', 'b']);
        queue.push(async () => done.push('c'));
        await queue.idle;
        assert.deepEqual(done, ['a', 'b', 'c'], 'accepts again once drained');
    });

    // --------------------------------------------------------------
    QUnit.module('lifecycle / memory safety');

    QUnit.test('listeners bound once per mount, removed on unmount, no duplication on re-render', async function (assert) {
        const target = getFixture();
        const env = await makeTestEnv();
        const calls = { keydown: 0, keyup: 0 };
        const baseActive = ListenerStats.active;
        const baseAttach = ListenerStats.attachCount;

        class Root extends Component {
            setup() {
                this.state = useState({ n: 0 });
                useWindowKeyListeners({
                    keydown: () => calls.keydown++,
                    keyupCapture: () => calls.keyup++,
                });
            }
        }
        Root.template = xml`<div class="pksa-root"><t t-esc="state.n"/></div>`;

        const fire = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
        };

        for (let cycle = 0; cycle < 3; cycle++) {
            const comp = await mount(Root, target, { env });
            assert.strictEqual(ListenerStats.active, baseActive + 1, `cycle ${cycle}: one active binding`);
            // 25 re-renders must not add listeners
            for (let i = 0; i < 25; i++) {
                comp.state.n++;
                await nextTick();
            }
            calls.keydown = calls.keyup = 0;
            fire();
            assert.deepEqual(calls, { keydown: 1, keyup: 1 }, `cycle ${cycle}: handler fired once`);
            destroy(comp);
            assert.strictEqual(ListenerStats.active, baseActive, `cycle ${cycle}: detached`);
            calls.keydown = calls.keyup = 0;
            fire();
            assert.deepEqual(calls, { keydown: 0, keyup: 0 }, `cycle ${cycle}: no leak after unmount`);
        }
        assert.strictEqual(ListenerStats.attachCount - baseAttach, 3, 'exactly one attach per mount');
    });
});
