# -*- coding: utf-8 -*-
{
    'name': 'POS Keyboard Shortcuts & Grid Navigation',
    'version': '18.0.1.1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Keyboard-first POS: 2D product grid navigation with arrow keys, '
               'PageUp/PageDown order line selection, Enter = click, '
               'and admin-configurable key mappings.',
    'description': """
POS Keyboard Shortcuts & Grid Navigation
========================================
* Arrow keys move a focus cursor across the product grid (true 2D, RTL aware).
* Enter on a focused product card behaves exactly like a mouse click
  (adds 1 unit, increments on every following press).
* PageUp / PageDown select the previous / next order line.
* Every mapping is stored in ``pos.keyboard.shortcut`` and can be changed,
  disabled, scoped per POS, or auto-suggested from the backend.
* Barcode-scanner safe: scanned codes ending with Enter are never mistaken
  for a keyboard shortcut.
* Works on Community and Enterprise.
""",
    'author': 'Ibrahim Yahia',
    'website': 'https://www.linkedin.com/in/ibrahim-yahia',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'data/pos_keyboard_shortcut_data.xml',
        'views/pos_keyboard_shortcut_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_keyboard_shortcut_advanced/static/src/app/**/*',
        ],
        'web.assets_backend': [
            'pos_keyboard_shortcut_advanced/static/src/backend/**/*',
        ],
        'web.assets_tests': [
            'pos_keyboard_shortcut_advanced/static/tests/tours/**/*',
        ],
        'web.assets_unit_tests': [
            # Hoot unit tests only load what they import
            'pos_keyboard_shortcut_advanced/static/src/app/shortcut_utils.js',
            'pos_keyboard_shortcut_advanced/static/tests/unit/**/*',
        ],
    },
    'images': ['static/description/banner.png'],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
