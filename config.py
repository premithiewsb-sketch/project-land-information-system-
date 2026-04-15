"""
config.py - Application Configuration for India LIMS
Centralized settings for the application.
"""

import os
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

# ─── Application Settings ───────────────────────────────────────────────────
# Use environment variable or generate random key for production security
SECRET_KEY = os.environ.get("LIMS_SECRET_KEY") or os.urandom(32).hex()
DEBUG = os.environ.get("LIMS_DEBUG", "false").lower() == "true"
HOST = os.environ.get("LIMS_HOST", "127.0.0.1")
PORT = int(os.environ.get("LIMS_PORT", 5000))

# ─── Database Configuration ──────────────────────────────────────────────────
# The MongoDB Atlas connection string
MONGO_URI = os.environ.get("MONGO_URI")

if not MONGO_URI:
    print("WARNING: MONGO_URI is not set in the environment or .env file.")

# ─── Data Paths (relative to project root) ───────────────────────────────────
# Note: app.py overrides these for PyInstaller using resource_path()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
RECORDS_FILE = os.path.join(DATA_DIR, "records.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")

# ─── Land Use Configuration ─────────────────────────────────────────────────
LAND_USE_OPTIONS = [
    "Agricultural",
    "Residential",
    "Commercial",
    "Industrial",
    "Government",
    "Forest",
    "Wasteland"
]

# ─── Land Use Color Map ──────────────────────────────────────────────────────
LAND_USE_COLORS = {
    "Agricultural": "#22c55e",
    "Residential": "#3b82f6",
    "Commercial": "#f59e0b",
    "Industrial": "#8b5cf6",
    "Government": "#ef4444",
    "Forest": "#065f46",
    "Wasteland": "#9ca3af"
}

# ─── Mutation Types ─────────────────────────────────────────────────────────
MUTATION_TYPES = [
    "Sale Deed",
    "Inheritance",
    "Gift Deed",
    "Partition",
    "Court Order"
]

# ─── Pagination ──────────────────────────────────────────────────────────────
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

# ─── Dashboard Limits ────────────────────────────────────────────────────────
DASHBOARD_TOP_DISTRICTS = 6
DASHBOARD_RECENT_MUTATIONS = 6
