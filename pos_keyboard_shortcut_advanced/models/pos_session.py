# -*- coding: utf-8 -*-
from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config):
        result = super()._load_pos_data_models(config)
        result.append('pos.keyboard.shortcut')
        return result
