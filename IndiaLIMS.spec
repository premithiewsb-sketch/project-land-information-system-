# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['c:\\Users\\user\\Desktop\\zz\\app.py'],
    pathex=[],
    binaries=[],
    datas=[('c:\\Users\\user\\Desktop\\zz\\templates', 'templates'), ('c:\\Users\\user\\Desktop\\zz\\static', 'static')],
    hiddenimports=['flask', 'werkzeug', 'werkzeug.security', 'jinja2', 'shapely', 'shapely.geometry', 'shapely.validation', 'fpdf', 'pandas', 'openpyxl', 'qrcode', 'webview', 'pymongo', 'dnspython', 'certifi', 'dotenv'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='IndiaLIMS',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
