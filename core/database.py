import os
import json
import uuid
from datetime import datetime
from pymongo import MongoClient, ReplaceOne
import certifi

from config import MONGO_URI
from utils import resource_path

# Override data paths for PyInstaller
DATA_DIR = resource_path("data")
RECORDS_FILE = os.path.join(DATA_DIR, "records.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")

# Database Setup (MongoDB)
try:
    mongo_client = MongoClient(MONGO_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
    db = mongo_client.get_database("indialims")
    users_collection = db.users
    records_collection = db.records
    feedback_collection = db.feedback
    audit_collection = db.audit
    print("Successfully connected to MongoDB Cluster.")
except Exception as e:
    print(f"MongoDB connection error: {e}")
    mongo_client = None
    db = None
    users_collection = None
    records_collection = None
    feedback_collection = None
    audit_collection = None

# --- Data Access Helpers ---

def load_users():
    if users_collection is None: return []
    return list(users_collection.find({}, {"_id": 0}))

def save_users(users):
    if users_collection is None: return
    if not users:
        users_collection.delete_many({})
        return
    requests = [ReplaceOne({"user_id": u["user_id"]}, u, upsert=True) for u in users]
    users_collection.bulk_write(requests)
    users_collection.delete_many({"user_id": {"$nin": [u["user_id"] for u in users]}})

def load_records():
    if records_collection is None: return []
    records = list(records_collection.find({}))
    for r in records:
        if "_id" in r:
            r["_id"] = str(r["_id"])
    return records

def save_records(records):
    if records_collection is None: return
    if not records:
        records_collection.delete_many({})
        return
    requests = [ReplaceOne({"_id": r["_id"]}, r, upsert=True) for r in records]
    records_collection.bulk_write(requests)
    records_collection.delete_many({"_id": {"$nin": [r["_id"] for r in records]}})

def load_feedback():
    if feedback_collection is None: return []
    return list(feedback_collection.find({}, {"_id": 0}))

def save_feedback(feedback_data):
    if feedback_collection is None: return
    if not feedback_data:
        feedback_collection.delete_many({})
        return
    requests = [ReplaceOne({"id": f["id"]}, f, upsert=True) for f in feedback_data]
    feedback_collection.bulk_write(requests)
    feedback_collection.delete_many({"id": {"$nin": [f["id"] for f in feedback_data]}})

def _log_audit(action, performed_by, record_id=None, details=None):
    """Write a simple audit entry to the audit collection/file."""
    try:
        entry = {
            "action": action,
            "performed_by": performed_by,
            "record_id": record_id,
            "details": details or {},
            "timestamp": datetime.now().isoformat() + "Z"
        }
        if audit_collection is not None:
            audit_collection.insert_one(entry)
        else:
            audit_file = os.path.join(DATA_DIR, "audit.json")
            try:
                if os.path.exists(audit_file):
                    with open(audit_file, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                else:
                    existing = []
            except Exception:
                existing = []
            existing.append(entry)
            with open(audit_file, "w", encoding="utf-8") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

def get_audit_collection():
    return audit_collection

def get_data_dir():
    return DATA_DIR
