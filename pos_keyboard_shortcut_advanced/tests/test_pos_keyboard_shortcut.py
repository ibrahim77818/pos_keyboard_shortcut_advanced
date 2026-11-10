# -*- coding: utf-8 -*-
from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged

from odoo.addons.pos_keyboard_shortcut_advanced.models.pos_keyboard_shortcut import (
    DEFAULT_COMBOS, build_combo, normalize_key, parse_combo,
)


@tagged('post_install', '-at_install')
class TestPosKeyboardShortcut(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Shortcut = cls.env['pos.keyboard.shortcut']
        cls.config_a = cls.env['pos.config'].create({'name': 'PKSA Shop A'})
        cls.config_b = cls.env['pos.config'].create({'name': 'PKSA Shop B'})

    # ------------------------------------------------------------------
    def test_normalisation_helpers(self):
        self.assertEqual(normalize_key('pageup'), 'PageUp')
        self.assertEqual(normalize_key('A'), 'a')
        self.assertEqual(normalize_key(' '), 'Space')
        self.assertEqual(build_combo('S', ctrl=True, alt=True), 'ctrl+alt+s')
        self.assertEqual(parse_combo('ctrl+shift+ArrowUp'), ('ArrowUp', True, False, True))

    def test_factory_map_installed(self):
        records = self.Shortcut.search([])
        self.assertEqual(set(records.mapped('action')), set(DEFAULT_COMBOS))
        for rec in records:
            self.assertEqual(rec.combo, DEFAULT_COMBOS[rec.action])
            self.assertTrue(rec.is_default)
            self.assertTrue(rec.name)

    def test_combo_and_display(self):
        rec = self.Shortcut.create({'action': 'go_payment', 'key': 'P', 'alt_key': True,
                                    'ctrl_key': True, 'config_ids': [(6, 0, self.config_a.ids)]})
        self.assertEqual(rec.combo, 'ctrl+alt+p')
        self.assertEqual(rec.combo_display, 'Ctrl+Alt+P')
        self.assertFalse(rec.is_default)

    # ------------------------------------------------------------------
    def test_reject_printable_without_modifier(self):
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'go_payment', 'key': '5'})
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'go_payment', 'key': 'p', 'shift_key': True})

    def test_reject_reserved_keys(self):
        for key in ('Backspace', 'Delete', 'Tab', 'Escape', 'Space', 'F5', 'F12'):
            with self.assertRaises(ValidationError, msg=key):
                self.Shortcut.create({'action': 'show_help', 'key': key})
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'go_payment', 'key': 'Enter'})
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'go_payment', 'key': 'r', 'ctrl_key': True})

    def test_conflict_detection_and_scopes(self):
        # global PageUp already exists
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'go_payment', 'key': 'PageUp'})
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'go_payment', 'key': 'PageUp',
                                  'config_ids': [(6, 0, self.config_a.ids)]})
        a = self.Shortcut.create({'action': 'go_payment', 'key': 'F7',
                                  'config_ids': [(6, 0, self.config_a.ids)]})
        # same key on a disjoint POS is fine
        self.Shortcut.create({'action': 'show_help', 'key': 'F7',
                              'config_ids': [(6, 0, self.config_b.ids)]})
        # ... but not on an overlapping one
        with self.assertRaises(ValidationError):
            self.Shortcut.create({'action': 'show_help', 'key': 'F7',
                                  'config_ids': [(6, 0, (self.config_a | self.config_b).ids)]})
        # archived shortcuts free their key
        a.active = False
        self.Shortcut.create({'action': 'focus_grid', 'key': 'F7',
                              'config_ids': [(6, 0, self.config_a.ids)]})

    # ------------------------------------------------------------------
    def test_suggestion_engine(self):
        help_rec = self.Shortcut.search([('action', '=', 'show_help')])
        extra = self.Shortcut.create({'action': 'show_help', 'key': 'F4'})
        extra.key = 'F6'
        # F1 is taken by help_rec -> suggest the next preferred free combo
        combo = extra._suggest_combo()
        self.assertTrue(combo)
        self.assertNotEqual(combo, 'F1')
        self.assertFalse(self.Shortcut._combo_problem(combo, 'show_help'))
        self.assertFalse(extra._find_conflicts(combo))
        extra.action_suggest_key()
        self.assertEqual(extra.combo, combo)
        self.assertEqual(combo, 'alt+h')
        # a free current combo is kept
        self.assertEqual(help_rec._suggest_combo(), 'F1')

    def test_restore_defaults(self):
        rec = self.Shortcut.search([('action', '=', 'orderline_prev')])
        rec.write({'key': 'ArrowUp', 'alt_key': True})
        self.assertFalse(rec.is_default)
        rec.action_restore_default()
        self.assertEqual(rec.combo, 'PageUp')
        rec.write({'key': 'ArrowUp', 'alt_key': True})
        self.Shortcut.create({'action': 'go_payment', 'key': 'F8',
                              'config_ids': [(6, 0, self.config_a.ids)]})
        self.Shortcut.action_reset_all_defaults()
        active = self.Shortcut.search([])
        self.assertEqual(sorted(active.mapped('combo')), sorted(DEFAULT_COMBOS.values()))
        self.assertFalse(active.filtered('config_ids'))

    # ------------------------------------------------------------------
    def test_effective_shortcuts_per_pos(self):
        self.Shortcut.create({'action': 'go_payment', 'key': 'F8',
                              'config_ids': [(6, 0, self.config_a.ids)]})
        eff_a = {r['action']: r['combo'] for r in self.Shortcut._get_effective_shortcuts(self.config_a)}
        eff_b = {r['action']: r['combo'] for r in self.Shortcut._get_effective_shortcuts(self.config_b)}
        self.assertEqual(eff_a['go_payment'], 'F8', 'POS specific shortcut overrides global F9')
        self.assertEqual(eff_b['go_payment'], 'F9')
        self.assertEqual(len(eff_a), len(DEFAULT_COMBOS))
        rows = self.Shortcut.get_pos_keyboard_shortcuts(self.config_a.id)
        self.assertTrue(all('combo_display' in r for r in rows))

    def test_pos_loader(self):
        self.assertIn('pos.keyboard.shortcut',
                      self.env['pos.session']._load_pos_data_models(self.config_a.id))
        data = {'pos.config': {'data': [{'id': self.config_a.id}]}}
        loaded = self.Shortcut._load_pos_data(data)
        self.assertEqual({r['action'] for r in loaded['data']}, set(DEFAULT_COMBOS))
        self.assertIn('combo_display', loaded['fields'])
        self.config_a.pksa_enabled = False
        self.assertEqual(self.Shortcut._load_pos_data(data)['data'], [])
        self.assertEqual(self.Shortcut.get_pos_keyboard_shortcuts(self.config_a.id), [])
