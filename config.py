"""
config.py - Application Configuration for India LIMS
Centralized settings for the application.
"""

import os
from dotenv import load_dotenv
from utils import resource_path

# Load variables from .env file
env_path = resource_path(".env")
load_dotenv(env_path)

# --- Application Settings ---
# Use environment variable, or persist a generated key to file so sessions
# survive server restarts.
def _get_or_create_secret_key():
    env_key = os.environ.get("LIMS_SECRET_KEY")
    if env_key:
        return env_key
    key_file = os.path.join(BASE_DIR, ".secret_key")
    if os.path.exists(key_file):
        with open(key_file, "r") as f:
            return f.read().strip()
    new_key = os.urandom(32).hex()
    with open(key_file, "w") as f:
        f.write(new_key)
    return new_key

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET_KEY = _get_or_create_secret_key()
DEBUG = os.environ.get("LIMS_DEBUG", "false").lower() == "true"

# Render provides 'PORT' env var, standard local uses 'LIMS_PORT'
PORT = int(os.environ.get("PORT", os.environ.get("LIMS_PORT", 5000)))

# On Render/Production, bind to all interfaces; locally use 127.0.0.1 for safety
RENDER = os.environ.get("RENDER")
HOST = os.environ.get("LIMS_HOST", "0.0.0.0" if RENDER else "127.0.0.1")

# --- Database Configuration ---
# The MongoDB Atlas connection string
MONGO_URI = os.environ.get("MONGO_URI")

if not MONGO_URI:
    print("WARNING: MONGO_URI is not set in the environment or .env file.")

# --- Data Paths (relative to project root) ---
# Note: app.py overrides these for PyInstaller using resource_path()
DATA_DIR = os.path.join(BASE_DIR, "data")
RECORDS_FILE = os.path.join(DATA_DIR, "records.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")

# --- Land Use Configuration ---
LAND_USE_OPTIONS = [
    "Agricultural",
    "Residential",
    "Commercial",
    "Industrial",
    "Government",
    "Forest",
    "Wasteland"
]

# --- Land Use Color Map ---
LAND_USE_COLORS = {
    "Agricultural": "#22c55e",
    "Residential": "#3b82f6",
    "Commercial": "#f59e0b",
    "Industrial": "#8b5cf6",
    "Government": "#ef4444",
    "Forest": "#065f46",
    "Wasteland": "#9ca3af"
}

# --- Mutation Types ---
MUTATION_TYPES = [
    "Sale Deed",
    "Inheritance",
    "Gift Deed",
    "Partition",
    "Court Order"
]

# --- Pagination ---
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

# --- Dashboard Limits ---
DASHBOARD_TOP_DISTRICTS = 6
DASHBOARD_RECENT_MUTATIONS = 6
