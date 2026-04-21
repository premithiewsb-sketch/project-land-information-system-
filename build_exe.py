"""
build_exe.py - PyInstaller & PyWebView Compilation Script for India LIMS
Compiles the application into a standalone Windows .exe using PyWebView
as the GUI wrapper and PyInstaller for bundling.

Usage:
    python build_exe.py          # Build the .exe
    python build_exe.py --run    # Run in PyWebView window (for testing)
"""

import os
import sys
import subprocess
import threading
import time

from utils import resource_path


def start_flask():
    """Start the Flask server in a background thread."""
    from app import app
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)


def run_pywebview():
    """Run the application in a PyWebView window (for testing)."""
    try:
        import webview
    except ImportError:
        print("ERROR: pywebview is not installed. Install with: pip install pywebview")
        sys.exit(1)

    # Start Flask in background thread
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # Wait for Flask to be ready
    print("Waiting for Flask server to start...")
    time.sleep(2)

    # Enable downloads in PyWebView
    import webview
    webview.settings['ALLOW_DOWNLOADS'] = True

    # Create PyWebView window
    window = webview.create_window(
        title="India LIMS - Land Information Management System",
        url="http://127.0.0.1:5000/login",
        width=1400,
        height=900,
        min_size=(1024, 700),
        resizable=True,
        frameless=False,
        easy_drag=True
    )

    webview.start(debug=False)
    print("Application closed.")


def build_exe():
    """Build the standalone .exe using PyInstaller."""
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("ERROR: PyInstaller is not installed. Install with: pip install pyinstaller")
        sys.exit(1)

    project_dir = os.path.dirname(os.path.abspath(__file__))

    # PyInstaller command
    pyinstaller_args = [
        sys.executable,
        '-m',
        'PyInstaller',
        '--name=IndiaLIMS',
        '--onefile',
        '--windowed',  # No console window on Windows
        '--clean',
    ]

    # Add icon if available
    icon_path = os.path.join(project_dir, 'logo.ico')
    if os.path.exists(icon_path):
        pyinstaller_args.append('--icon=' + icon_path)
        print('Using icon: ' + icon_path)
    else:
        print('Warning: Icon file not found at ' + icon_path + ". Please place a 'logo.ico' in the project root to include an icon.")

    pyinstaller_args.extend([
        # Add data files (templates, static)
        '--add-data=' + os.path.join(project_dir, 'templates') + os.pathsep + 'templates',
        '--add-data=' + os.path.join(project_dir, 'static') + os.pathsep + 'static',
        '--add-data=' + os.path.join(project_dir, '.env') + os.pathsep + '.',

        # Hidden imports that PyInstaller might miss
        '--hidden-import=flask',
        '--hidden-import=werkzeug',
        '--hidden-import=werkzeug.security',
        '--hidden-import=jinja2',
        '--hidden-import=shapely',
        '--hidden-import=shapely.geometry',
        '--hidden-import=shapely.validation',
        '--hidden-import=fpdf',
        '--hidden-import=pandas',
        '--hidden-import=openpyxl',
        '--hidden-import=qrcode',
        '--hidden-import=webview',
        '--hidden-import=pymongo',
        '--hidden-import=dnspython',
        '--hidden-import=certifi',
        '--hidden-import=dotenv',

        # Main entry point
        os.path.join(project_dir, 'app.py')
    ])

    print('=' * 60)
    print('  Building India LIMS .exe with PyInstaller')
    print('=' * 60)
    print('\nCommand: ' + ' '.join(pyinstaller_args) + '\n')

    result = subprocess.run(pyinstaller_args, cwd=project_dir)

    if result.returncode == 0:
        print('\n' + '=' * 60)
        print('  BUILD SUCCESSFUL!')
        print('  Executable: ' + os.path.join(project_dir, 'dist', 'IndiaLIMS.exe'))
        print('=' * 60)
    else:
        print('\n' + '=' * 60)
        print('  BUILD FAILED!')
        print('=' * 60)
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--run':
        # Run in PyWebView window for testing
        run_pywebview()
    else:
        # Build the .exe
        build_exe()
