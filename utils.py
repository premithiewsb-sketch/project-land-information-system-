"""
utils.py - Shared Utilities for India LIMS
Common functions used across the application.
"""

import os
import sys


def resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller."""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)


def safe_divide(numerator, denominator, default=0):
    """Safely divide two numbers, returning default on division by zero."""
    try:
        return numerator / denominator if denominator else default
    except (TypeError, ZeroDivisionError):
        return default
