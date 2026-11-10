# -*- coding: utf-8 -*-
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

# --------------------------------------------------------------------------
# Action catalogue
# --------------------------------------------------------------------------
# Keep in sync with ``ACTIONS`` in static/src/js/shortcut_utils.js
SHORTCUT_ACTIONS = [
    ('orderline_prev', 'Select Previous Order Line'),
    ('orderline_next', 'Select Next Order Line'),
    ('grid_up', 'Product Grid: Move Up'),
    ('grid_down', 'Product Grid: Move Down'),
    ('grid_left', 'Product Grid: Move Left'),
    ('grid_right', 'Product Grid: Move Right'),
    ('activate_product', 'Add Focused Product (same as mouse click)'),
    ('focus_search', 'Focus Product Search'),
    ('focus_grid', 'Focus Product Grid'),
    ('go_payment', 'Go to Payment'),
    ('show_help', 'Show Keyboard Shortcuts'),
]

DEFAULT_COMBOS = {
    'orderline_prev': 'PageUp',
    'orderline_next': 'PageDown',
    'grid_up': 'ArrowUp',
    'grid_down': 'ArrowDown',
    'grid_left': 'ArrowLeft',
    'grid_right': 'ArrowRight',
    'activate_product': 'Enter',
    'focus_search': 'F2',
    'focus_grid': 'F3',
    'go_payment': 'F9',
    'show_help': 'F1',
}

# Preferred suggestions per action, tried before the generic pool.
PREFERRED_COMBOS = {
    'orderline_prev': ['PageUp', 'alt+ArrowUp', 'ctrl+ArrowUp', 'alt+PageUp'],
    'orderline_next': ['PageDown', 'alt+ArrowDown', 'ctrl+ArrowDown', 'alt+PageDown'],
    'grid_up': ['ArrowUp', 'ctrl+alt+ArrowUp', 'shift+ArrowUp'],
    'grid_down': ['ArrowDown', 'ctrl+alt+ArrowDown', 'shift+ArrowDown'],
    'grid_left': ['ArrowLeft', 'ctrl+alt+ArrowLeft', 'shift+ArrowLeft'],
    'grid_right': ['ArrowRight', 'ctrl+alt+ArrowRight', 'shift+ArrowRight'],
    'activate_product': ['Enter', 'Insert', 'ctrl+Enter'],
    'focus_search': ['F2', 'alt+s', 'ctrl+alt+s'],
    'focus_grid': ['F3', 'alt+g', 'ctrl+alt+g'],
    'go_payment': ['F9', 'alt+p', 'ctrl+alt+p'],
    'show_help': ['F1', 'alt+h', 'ctrl+alt+h'],
}
GENERIC_POOL = (
    ['F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10', 'Home', 'End', 'Insert']
    + ['alt+%s' % c for c in 'abcdefghijklmnopqrstuvwxyz0123456789']
    + ['ctrl+alt+%s' % c for c in 'abcdefghijklmnopqrstuvwxyz']
    + ['alt+F%d' % i for i in range(1, 11)]
)

# Canonical spelling of non-printable keys (KeyboardEvent.key values).
NAMED_KEYS = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown',
    'Home', 'End', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert',
    'Space',
] + ['F%d' % i for i in range(1, 13)]
NAMED_KEYS_LOWER = {k.lower(): k for k in NAMED_KEYS}
KEY_ALIASES = {
    ' ': 'Space', 'spacebar': 'Space', 'esc': 'Escape', 'del': 'Delete',
    'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
    'pgup': 'PageUp', 'pgdn': 'PageDown', 'return': 'Enter', 'ins': 'Insert',
}

# Keys that must never be bound without Ctrl/Alt because the POS already
# relies on them (numpad buffer, popups, form navigation).
RESERVED_PLAIN_KEYS = {'Backspace', 'Delete', 'Tab', 'Escape', 'Space'}
# Combos the browser keeps for itself (cannot be reliably prevented).
BROWSER_RESERVED = {'F5', 'F11', 'F12', 'ctrl+r', 'ctrl+w', 'ctrl+t', 'ctrl+n',
                    'ctrl+shift+i', 'ctrl+shift+j', 'ctrl+shift+r', 'ctrl+F5'}


def normalize_key(key):
    """Return the canonical spelling of a KeyboardEvent.key value."""
    if key is None:
        return ''
    if key == ' ':
        return 'Space'
    key = key.strip()
    if not key:
        return ''
    if len(key) == 1:
        return key.lower()
    lower = key.lower()
    if lower in KEY_ALIASES:
        return KEY_ALIASES[lower]
    return NAMED_KEYS_LOWER.get(lower, key)


def build_combo(key, ctrl=False, alt=False, shift=False):
    parts = []
    if ctrl:
        parts.append('ctrl')
    if alt:
        parts.append('alt')
    if shift:
        parts.append('shift')
    parts.append(normalize_key(key))
    return '+'.join(parts)


def parse_combo(combo):
    """'ctrl+alt+ArrowUp' -> (key, ctrl, alt, shift)."""
    parts = combo.split('+')
    # '+' itself as a key would yield empty trailing parts
    key = parts[-1] or '+'
    mods = set(p.lower() for p in parts[:-1])
    return normalize_key(key), 'ctrl' in mods, 'alt' in mods, 'shift' in mods


class PosKeyboardShortcut(models.Model):
    _name = 'pos.keyboard.shortcut'
    _description = 'POS Keyboard Shortcut'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    action = fields.Selection(SHORTCUT_ACTIONS, required=True, index=True)
    key = fields.Char(
        required=True,
        help="KeyboardEvent.key value, e.g. ArrowUp, PageDown, Enter, F2 or a letter "
             "(letters and digits require Ctrl or Alt).")
    ctrl_key = fields.Boolean('Ctrl')
    alt_key = fields.Boolean('Alt')
    shift_key = fields.Boolean('Shift')
    combo = fields.Char(compute='_compute_combo', store=True, index=True,
                        help="Normalized technical combination used by the POS key registry.")
    combo_display = fields.Char('Shortcut', compute='_compute_combo')
    default_combo = fields.Char('Default', compute='_compute_default_combo')
    is_default = fields.Boolean(compute='_compute_default_combo')
    config_ids = fields.Many2many(
        'pos.config', string='Point of Sale',
        help="Leave empty to apply to every Point of Sale. A shortcut bound to a "
             "specific Point of Sale overrides the global shortcuts of the same "
             "action for that Point of Sale.")
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    note = fields.Text()

    # ------------------------------------------------------------------
    # Computes
    # ------------------------------------------------------------------
    @api.model
    def _action_label(self, action):
        return dict(self._fields['action']._description_selection(self.env)).get(action)

    @api.model_create_multi
    def create(self, vals_list):
        # ``name`` is NOT NULL: fill it from the action label *before* the
        # INSERT (a stored compute would only run after it).
        for vals in vals_list:
            if not vals.get('name') and vals.get('action'):
                vals['name'] = self._action_label(vals['action'])
        return super().create(vals_list)

    @api.onchange('action')
    def _onchange_action_name(self):
        labels = dict(self._fields['action']._description_selection(self.env))
        if self.action and (not self.name or self.name in labels.values()):
            self.name = labels[self.action]

    @api.depends('key', 'ctrl_key', 'alt_key', 'shift_key')
    def _compute_combo(self):
        for rec in self:
            if not rec.key:
                rec.combo = False
                rec.combo_display = False
                continue
            rec.combo = build_combo(rec.key, rec.ctrl_key, rec.alt_key, rec.shift_key)
            rec.combo_display = self._display_combo(rec.combo)

    @api.depends('action', 'combo')
    def _compute_default_combo(self):
        for rec in self:
            default = DEFAULT_COMBOS.get(rec.action)
            rec.default_combo = self._display_combo(default) if default else False
            rec.is_default = bool(default) and rec.combo == default

    @api.model
    def _display_combo(self, combo):
        if not combo:
            return ''
        key, ctrl, alt, shift = parse_combo(combo)
        parts = [label for flag, label in ((ctrl, 'Ctrl'), (alt, 'Alt'), (shift, 'Shift')) if flag]
        parts.append(key.upper() if len(key) == 1 else key)
        return '+'.join(parts)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    @api.model
    def _combo_problem(self, combo, action):
        """Return an error message if ``combo`` is unusable for ``action``."""
        key, ctrl, alt, _shift = parse_combo(combo)
        if not key:
            return _("A key is required.")
        if len(key) == 1 and not (ctrl or alt):
            return _("'%s': printable characters (letters, digits, symbols) need Ctrl or Alt. "
                     "Without a modifier they would collide with barcode scanners and the "
                     "numpad quantity buffer.", self._display_combo(combo))
        if key in RESERVED_PLAIN_KEYS and not (ctrl or alt):
            return _("'%s' is used by the POS itself (numpad, popups, form navigation). "
                     "Combine it with Ctrl or Alt.", key)
        if key == 'Enter' and not (ctrl or alt) and action != 'activate_product':
            return _("Plain Enter is reserved for 'Add Focused Product' and for barcode scanners.")
        if combo in BROWSER_RESERVED:
            return _("'%s' is reserved by the web browser.", self._display_combo(combo))
        return False

    @api.model
    def _search_conflicts(self, combo, config_ids, exclude_ids=()):
        """Active shortcuts using ``combo`` whose POS scope overlaps ``config_ids``.

        An empty scope means "every Point of Sale" and overlaps everything.
        """
        domain = [('combo', '=', combo), ('active', '=', True)]
        if exclude_ids:
            domain.append(('id', 'not in', list(exclude_ids)))
        scope = set(config_ids or [])
        return self.search(domain).filtered(
            lambda o: not scope or not o.config_ids or bool(scope & set(o.config_ids.ids)))

    def _find_conflicts(self, combo=None):
        self.ensure_one()
        return self._search_conflicts(
            combo or self.combo, self.config_ids._origin.ids or self.config_ids.ids,
            self._origin.ids or [i for i in self.ids if isinstance(i, int)])

    @api.constrains('key', 'ctrl_key', 'alt_key', 'shift_key', 'action', 'active', 'config_ids')
    def _check_combo(self):
        for rec in self.filtered('active'):
            problem = self._combo_problem(rec.combo, rec.action)
            if problem:
                raise ValidationError(problem)
            conflicts = rec._find_conflicts()
            if conflicts:
                raise ValidationError(_(
                    "Shortcut %(combo)s is already used by '%(other)s'. "
                    "Use 'Suggest Free Key' to get an available combination.",
                    combo=rec.combo_display, other=conflicts[0].name))

    @api.onchange('key', 'ctrl_key', 'alt_key', 'shift_key', 'action', 'config_ids')
    def _onchange_combo_warning(self):
        if not self.key or not self.action:
            return
        combo = build_combo(self.key, self.ctrl_key, self.alt_key, self.shift_key)
        canonical = parse_combo(combo)[0]
        if canonical != self.key:
            self.key = canonical
        problem = self._combo_problem(combo, self.action)
        if not problem and self.active:
            conflicts = self._find_conflicts(combo)
            if conflicts:
                problem = _("Already used by '%s'.", conflicts[0].name)
        if problem:
            return {'warning': {'title': _("Shortcut conflict"), 'message': problem}}

    # ------------------------------------------------------------------
    # Suggestion engine
    # ------------------------------------------------------------------
    def _suggest_combo(self):
        """First conflict-free, valid combination for this record's action."""
        self.ensure_one()
        seen = set()
        for combo in PREFERRED_COMBOS.get(self.action, []) + GENERIC_POOL:
            combo = build_combo(*parse_combo(combo))
            if combo in seen:
                continue
            seen.add(combo)
            if combo == self.combo:
                # Current one is kept only if it is valid and free
                if not self._combo_problem(combo, self.action) and not self._find_conflicts(combo):
                    return combo
                continue
            if self._combo_problem(combo, self.action):
                continue
            if not self._find_conflicts(combo):
                return combo
        return False

    def _apply_combo(self, combo):
        key, ctrl, alt, shift = parse_combo(combo)
        self.write({'key': key, 'ctrl_key': ctrl, 'alt_key': alt, 'shift_key': shift})

    def action_suggest_key(self):
        for rec in self:
            combo = rec._suggest_combo()
            if not combo:
                raise ValidationError(_("No free combination left for '%s'.", rec.name))
            if combo != rec.combo:
                rec._apply_combo(combo)
        return True

    def action_restore_default(self):
        for rec in self:
            default = DEFAULT_COMBOS.get(rec.action)
            if default and default != rec.combo:
                rec._apply_combo(default)
        return True

    @api.model
    def action_reset_all_defaults(self):
        """Restore the factory key map: one global shortcut per action."""
        all_recs = self.with_context(active_test=False).search([])
        all_recs.filtered('config_ids').write({'active': False})
        globals_ = all_recs - all_recs.filtered('config_ids')
        # free every combo first to avoid transient conflicts
        globals_.write({'active': False})
        done = set()
        for rec in globals_.sorted('id'):
            if rec.action in done or rec.action not in DEFAULT_COMBOS:
                continue
            key, ctrl, alt, shift = parse_combo(DEFAULT_COMBOS[rec.action])
            rec.write({'key': key, 'ctrl_key': ctrl, 'alt_key': alt,
                       'shift_key': shift, 'active': True})
            done.add(rec.action)
        for action, combo in DEFAULT_COMBOS.items():
            if action not in done:
                key, ctrl, alt, shift = parse_combo(combo)
                self.create({'action': action, 'key': key, 'ctrl_key': ctrl,
                             'alt_key': alt, 'shift_key': shift})
        return {'type': 'ir.actions.client', 'tag': 'reload'}

    # ------------------------------------------------------------------
    # POS loading
    # ------------------------------------------------------------------
    @api.model
    def _pos_fields(self):
        return ['id', 'name', 'action', 'key', 'ctrl_key', 'alt_key', 'shift_key',
                'combo', 'sequence']

    @api.model
    def _get_effective_shortcuts(self, config):
        """Shortcuts active for ``config``.

        For each action, shortcuts bound to this POS replace the global ones.
        """
        records = self.search([
            '|', ('config_ids', '=', False), ('config_ids', 'in', config.ids),
        ])
        specific_actions = set(records.filtered('config_ids').mapped('action'))
        effective = records.filtered(
            lambda r: bool(r.config_ids) or r.action not in specific_actions)
        result = effective.read(self._pos_fields())
        for vals in result:
            vals['combo_display'] = self._display_combo(vals['combo'])
        return result

    @api.model
    def get_pos_keyboard_shortcuts(self, config_id):
        """RPC used by the POS to refresh its key registry without reloading."""
        config = self.env['pos.config'].browse(int(config_id)).exists()
        if not config or not config.pksa_enabled:
            return []
        return self._get_effective_shortcuts(config)
