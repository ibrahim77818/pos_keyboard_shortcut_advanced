# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_pksa_enabled = fields.Boolean(
        string='Keyboard Shortcuts', related='pos_config_id.pksa_enabled', readonly=False)
