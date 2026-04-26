import random

def _mask_owner_for_viewer(record):
    if "owner" not in record:
        return record
    record = record.copy()
    record["owner"] = record["owner"].copy()
    record["owner"].pop("aadhaar", None)
    record["owner"].pop("phone", None)
    name = record["owner"].get("name", "")
    parts = name.split()
    if len(parts) > 1:
        record["owner"]["name"] = parts[0] + " " + parts[1][0] + "."
    record["owner"].pop("proof_doc_b64", None)
    for mut in record.get("mutation_history", []):
        mut.pop("proof_doc_b64", None)
    return record

def _strip_b64_from_list(records):
    clean_records = []
    for r in records:
        r_copy = r.copy()
        if "owner" in r_copy:
            r_copy["owner"] = r_copy["owner"].copy()
            r_copy["owner"].pop("proof_doc_b64", None)
        if "mutation_history" in r_copy:
            r_copy["mutation_history"] = [m.copy() for m in r_copy["mutation_history"]]
            for m in r_copy["mutation_history"]:
                m.pop("proof_doc_b64", None)
        clean_records.append(r_copy)
    return clean_records

def _apply_filters_to_records(records, params):
    state = (params.get("state") or "").strip().lower()
    district = (params.get("district") or "").strip().lower()
    village = (params.get("village") or "").strip().lower()
    land_use = (params.get("land_use") or "").strip()
    search = (params.get("search") or "").strip().lower()
    if not any([state, district, village, land_use, search]):
        return records
    filtered = []
    for rec in records:
        loc = rec.get("location", {})
        attrs = rec.get("attributes", {})
        if state and loc.get("state", "").lower() != state: continue
        if district and loc.get("district", "").lower() != district: continue
        if village and loc.get("village", "").lower() != village: continue
        if land_use and attrs.get("land_use") != land_use: continue
        if search:
            search_text = " ".join([
                rec.get("khasra_no", ""),
                rec.get("ulpin", ""),
                loc.get("village", ""),
                loc.get("district", ""),
                rec.get("owner", {}).get("name", "")
            ]).lower()
            if search not in search_text: continue
        filtered.append(rec)
    return filtered

def _generate_ulpin():
    return str(random.randint(10000000000000, 99999999999999))

def _calculate_estimated_value(area_ha, circle_rate_inr, land_use):
    """
    Calculate estimated value using a land-use multiplier for realism.
    """
    multipliers = {
        'Commercial': 2.5,
        'Industrial': 1.8,
        'Residential': 1.5,
        'Agricultural': 1.0,
        'Government': 1.2,
        'Forest': 0.8,
        'Wasteland': 0.5
    }
    multiplier = multipliers.get(land_use, 1.0)
    return float(area_ha) * float(circle_rate_inr) * multiplier

def _update_nested(record, parent_key, child_key, value):
    if parent_key not in record:
        record[parent_key] = {}
    record[parent_key][child_key] = value
    return value
