"""
utils.py - Shared Utilities for India LIMS
Common functions used across the application.
"""

import os


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


def format_inr(value):
    """Format a number as Indian Rupee string with commas (en-IN locale style)."""
    try:
        return f"₹{round(value):,}"
    except (TypeError, ValueError):
        return "₹0"


def generate_mutation_ref(khasra_no, district):
    """Generate a unique mutation reference number.
    Format: MUT-YYYY-DISTCODE-XXXXX
    """
    import random
    from datetime import datetime
    
    year = datetime.now().year
    district_code = (district or "UNK")[:3].upper()
    seq = random.randint(10000, 99999)
    return f"MUT-{year}-{district_code}-{seq}"


import sys
