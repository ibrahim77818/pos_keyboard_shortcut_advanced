# -*- coding: utf-8 -*-
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    pksa_enabled = fields.Boolean(
        string='Keyboard Shortcuts', default=True,
        help="Enable keyboard grid navigation and shortcuts in this Point of Sale.")
