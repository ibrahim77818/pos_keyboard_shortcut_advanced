# -*- coding: utf-8 -*-
from odoo import api, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _pos_ui_models_to_load(self):
        result = super()._pos_ui_models_to_load()
        result.append('pos.keyboard.shortcut')
        return result

    def _loader_params_pos_keyboard_shortcut(self):
        return {'search_params': {}}

    def _get_pos_ui_pos_keyboard_shortcut(self, params):
        if not self.config_id.pksa_enabled:
            return []
        return self.env['pos.keyboard.shortcut']._get_effective_shortcuts(self.config_id)
