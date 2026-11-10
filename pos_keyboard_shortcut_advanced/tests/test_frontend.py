# -*- coding: utf-8 -*-
from odoo.tests import HttpCase, tagged

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


@tagged('post_install', '-at_install')
class TestPosKeyboardShortcutTour(TestPointOfSaleHttpCommon):

    @classmethod
    def setUpClass(cls, chart_template_ref=None):
        super().setUpClass(chart_template_ref=chart_template_ref)
        categ = cls.env['pos.category'].create({'name': 'PKSA Grid'})
        cls.env['product.product'].create([{
            'name': 'PKSA %02d' % i,
            'available_in_pos': True,
            'list_price': float(i),
            'taxes_id': [(5, 0, 0)],
            'pos_categ_id': categ.id,
        } for i in range(1, 9)])

    def test_keyboard_shortcuts_tour(self):
        self.main_pos_config.open_ui()
        self.env['ir.module.module'].search(
            [('name', 'in', ['point_of_sale', 'pos_keyboard_shortcut_advanced'])]).state = 'installed'
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id,
                        'PosKeyboardShortcutAdvancedTour', login="accountman")


@tagged('post_install', '-at_install')
class TestPosKeyboardShortcutQUnit(HttpCase):

    def setUp(self):
        super().setUp()
        env = self.env(user=self.env.ref('base.user_admin'))
        payment_method = env['pos.payment.method'].create({'name': 'PKSA Pay'})
        self.pos_config = env['pos.config'].create({
            'name': 'PKSA QUnit Shop',
            'payment_method_ids': [(4, payment_method.id)],
        })

    def test_pos_keyboard_qunit(self):
        self.pos_config.open_ui()
        self.pos_config.current_session_id.set_cashbox_pos(0, None)
        self.browser_js(
            "/pos/ui/tests?mod=web&filter=pos_keyboard_shortcut_advanced",
            "", "", login="admin", timeout=900)
