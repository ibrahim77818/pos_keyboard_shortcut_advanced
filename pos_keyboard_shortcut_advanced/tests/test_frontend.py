# -*- coding: utf-8 -*-
from odoo.tests import HttpCase, tagged

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


@tagged('post_install', '-at_install')
class TestPosKeyboardShortcutTour(TestPointOfSaleHttpCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        categ = cls.env['pos.category'].create({'name': 'PKSA Grid'})
        cls.env['product.product'].create([{
            'name': 'PKSA %02d' % i,
            'available_in_pos': True,
            'list_price': float(i),
            'taxes_id': [(5, 0, 0)],
            'pos_categ_ids': [(6, 0, categ.ids)],
        } for i in range(1, 9)])

    def test_keyboard_shortcuts_tour(self):
        # the tour measures one grid; grouped grids are covered by the unit tests
        self.main_pos_config.iface_group_by_categ = False
        self.main_pos_config.with_user(self.pos_user).open_ui()
        self.start_pos_tour('PosKeyboardShortcutAdvancedTour')


@tagged('post_install', '-at_install')
class TestPosKeyboardShortcutUnit(HttpCase):
    """Runs this module's Hoot unit tests (web.assets_unit_tests)."""

    def test_pos_keyboard_hoot(self):
        self.browser_js(
            '/web/tests?headless&loglevel=2&preset=desktop&timeout=15000'
            '&filter=pos_keyboard_shortcut_advanced',
            "", "", login='admin', timeout=900,
            success_signal="[HOOT] Test suite succeeded",
            error_checker=lambda message: '[HOOT]' not in message,
        )
