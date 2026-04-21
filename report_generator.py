"""
report_generator.py - Document Generation Module for India LIMS
Generates single-page PDF Property Cards and Excel Village Ledgers.
"""

import os
import io
import json
import uuid
import struct
import base64
import tempfile
from datetime import datetime

from utils import resource_path

try:
    from fpdf import FPDF
except ImportError:
    FPDF = None

try:
    import pandas as pd
except ImportError:
    pd = None

try:
    import qrcode
except ImportError:
    qrcode = None

# ── Unit Conversion Constants ─────────────────────────────────────────────────
HA_TO_ACRE        = 2.47105
HA_TO_BIGHA_ASSAM = 7.4752    # 1 Assam Bigha = 14,400 sq ft
HA_TO_LECHA_ASSAM = 747.52    # 1 Lecha = 1/100 Assam Bigha


def _fmt_inr(value):
    """Format a number as Indian Rupees with commas."""
    try:
        v = int(float(value))
        s = str(v)
        if len(s) > 3:
            last3 = s[-3:]
            rest = s[:-3]
            parts = []
            while len(rest) > 2:
                parts.append(rest[-2:])
                rest = rest[:-2]
            if rest:
                parts.append(rest)
            parts.reverse()
            return ','.join(parts) + ',' + last3
        return s
    except Exception:
        return str(value)


def generate_property_card_pdf(record, map_image_base64=None):
    """
    Generate a clean, single-page A4 PDF Property Card.

    Layout (all on one page):
      • Header with QR code
      • 2-column property info table
      • Prominent map section (90mm)
      • Polygon coordinates table
      • Footer
    """
    if FPDF is None:
        raise ImportError("fpdf2 is required. Install with: pip install fpdf2")

    pdf = PropertyCardPDF()
    pdf.set_auto_page_break(auto=False)   # We handle layout manually
    pdf.add_page()

    # ── Extract Data ─────────────────────────────────────────────────────────
    loc      = record.get("location", {})
    attrs    = record.get("attributes", {})
    owner    = record.get("owner", {})
    mutations = record.get("mutation_history", [])
    geometry = record.get("geometry", {})

    area_ha    = float(attrs.get("area_ha", 0) or 0)
    area_acres = round(area_ha * HA_TO_ACRE, 2)
    area_bigha = round(area_ha * HA_TO_BIGHA_ASSAM, 2)
    area_lecha = int(round(area_ha * HA_TO_LECHA_ASSAM))

    try:
        circle_rate     = float(attrs.get("circle_rate_inr", 0) or 0)
        estimated_value = area_ha * circle_rate
    except Exception:
        circle_rate = 0
        estimated_value = 0

    state    = loc.get("state",    "N/A")
    district = loc.get("district", "N/A")
    village  = loc.get("village",  "N/A")

    # ── QR Code (top-right) ──────────────────────────────────────────────────
    qr_path = None
    if qrcode is not None:
        try:
            qr = qrcode.QRCode(version=1, box_size=4, border=1)
            qr.add_data(record.get("ulpin", "N/A"))
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            qr_img.save(buf, format="PNG")
            buf.seek(0)
            qr_path = os.path.join(tempfile.gettempdir(), f"qr_{uuid.uuid4().hex[:8]}.png")
            with open(qr_path, "wb") as f:
                f.write(buf.getvalue())
            pdf.image(qr_path, x=183, y=10, w=18, h=18)
        except Exception:
            pass

    # ── Header ───────────────────────────────────────────────────────────────
    pdf.set_y(10)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(170, 7, "India LIMS - Property Card (Khasra Patta)", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(170, 4, "Land Information Management System | Academic Prototype", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(170, 5, f"{village}, {district}, {state}", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(1)

    pdf.set_draw_color(30, 64, 150)
    pdf.set_line_width(0.6)
    y_div = pdf.get_y()
    pdf.line(10, y_div, 200, y_div)
    pdf.ln(3)

    # ── Two-Column Info Table ────────────────────────────────────────────────
    Y_TABLE = pdf.get_y()
    RH = 6.5          # row height mm
    LW = 38           # label cell width
    VW = 54           # value cell width  (total col = 92mm)
    GAP = 6           # gap between cols

    def draw_row(x, y, label, value, fill=True):
        pdf.set_xy(x, y)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_fill_color(230, 237, 255)
        pdf.cell(LW, RH, f"  {label}", border=1, fill=fill)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_fill_color(255, 255, 255)
        val_str = str(value)[:42]
        pdf.cell(VW, RH, f"  {val_str}", border=1, fill=True, new_x="RIGHT", new_y="TOP")

    left = [
        ("ULPIN",        record.get("ulpin", "N/A")),
        ("Khasra No.",   record.get("khasra_no", "N/A")),
        ("Khata No.",    record.get("khata_no", "N/A")),
        ("Land Use",     attrs.get("land_use", "N/A")),
        ("State",        state),
        ("District",     district),
        ("Village/Ward", village),
    ]
    right = [
        ("Area (Ha)",    f"{area_ha} Ha"),
        ("Area (Acres)", f"{area_acres} Ac"),
        ("Area (Bigha)", f"{area_bigha} Bigha (Assam)"),
        ("Area (Lecha)", f"{area_lecha} Lecha (Assam)"),
        ("Circle Rate",  f"Rs. {_fmt_inr(int(circle_rate))}/Ha" if circle_rate else "N/A"),
        ("Est. Value",   f"Rs. {_fmt_inr(int(estimated_value))}" if estimated_value else "N/A"),
        ("Owner",        owner.get("name", "N/A")),
    ]

    for i, (lbl, val) in enumerate(left):
        draw_row(10, Y_TABLE + i * RH, lbl, val)
    for i, (lbl, val) in enumerate(right):
        draw_row(10 + LW + VW + GAP, Y_TABLE + i * RH, lbl, val)

    # One extra row: Share % and Mutations
    y_extra = Y_TABLE + 7 * RH
    draw_row(10, y_extra, "Share (%)", f"{owner.get('share_pct', 'N/A')}%")
    draw_row(10 + LW + VW + GAP, y_extra, "Mutations", f"{len(mutations)} on record")

    pdf.ln(0)
    y_after_table = y_extra + RH + 3

    # ── Divider ───────────────────────────────────────────────────────────────
    pdf.set_draw_color(30, 64, 150)
    pdf.set_line_width(0.4)
    pdf.line(10, y_after_table, 200, y_after_table)

    # ── Map Section ───────────────────────────────────────────────────────────
    MAP_LABEL_Y = y_after_table + 2
    MAP_Y       = MAP_LABEL_Y + 6
    MAP_H       = 118   # mm — generous height now that coords table is removed

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(10, MAP_LABEL_Y)
    pdf.cell(0, 5, "PARCEL MAP", new_x="LMARGIN", new_y="NEXT")

    if map_image_base64:
        try:
            if "," in map_image_base64:
                map_image_base64 = map_image_base64.split(",")[1]
            img_data = base64.b64decode(map_image_base64)

            tmp_map = os.path.join(tempfile.gettempdir(), f"map_{record.get('ulpin','x')}_{uuid.uuid4().hex[:6]}.png")
            with open(tmp_map, "wb") as f:
                f.write(img_data)

            # Read actual PNG dimensions for proportional placement
            img_w, img_h = 800, 450  # fallback defaults
            try:
                with open(tmp_map, "rb") as f:
                    f.read(8)
                    chunk = f.read(17)
                    if len(chunk) == 17:
                        img_w = struct.unpack(">I", chunk[8:12])[0]
                        img_h = struct.unpack(">I", chunk[12:16])[0]
            except Exception:
                pass

            # Scale to fill 190mm width, but cap at MAP_H height
            max_w = 190.0
            scale = min(max_w / img_w, MAP_H / (img_h * (210 / img_w)) if img_w else 1)
            draw_w = min(max_w, img_w * (max_w / img_w))
            draw_h = img_h * (draw_w / img_w)
            if draw_h > MAP_H:
                draw_h = MAP_H
                draw_w = img_w * (draw_h / img_h)

            x_pos = (210 - draw_w) / 2
            pdf.image(tmp_map, x=x_pos, y=MAP_Y, w=draw_w, h=draw_h)

            try:
                os.remove(tmp_map)
            except Exception:
                pass

        except Exception as e:
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_xy(10, MAP_Y + 5)
            pdf.cell(0, 6, f"Map not available: {str(e)[:60]}", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_xy(10, MAP_Y + 5)
        pdf.cell(0, 6, "Map image not captured.", new_x="LMARGIN", new_y="NEXT")

    y_after_map = MAP_Y + MAP_H + 3


    # ── Footer ───────────────────────────────────────────────────────────────
    pdf.set_y(281)   # 297 - 16mm from bottom
    pdf.set_draw_color(30, 64, 150)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(2)
    gen_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pdf.set_font("Helvetica", "I", 7)
    doc_id = f"PC-{record.get('ulpin','N/A')}-{datetime.now().strftime('%Y%m%d%H%M')}"
    pdf.cell(0, 4, f"Generated: {gen_time}  |  Document ID: {doc_id}  |  India LIMS Academic Prototype", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(0, 4, "Computer-generated document. Scan QR code for digital verification.", new_x="LMARGIN", new_y="NEXT", align="C")

    # Cleanup QR
    if qr_path:
        try:
            os.remove(qr_path)
        except Exception:
            pass

    # ── Output ────────────────────────────────────────────────────────────────
    try:
        return bytes(pdf.output())
    except Exception:
        output = pdf.output()
        if isinstance(output, (bytes, bytearray)):
            return bytes(output)
        return output.encode("latin-1") if isinstance(output, str) else bytes(output)


class PropertyCardPDF(FPDF):
    """Custom FPDF with thin blue top border."""

    def header(self):
        self.set_draw_color(30, 64, 150)
        self.set_line_width(1.2)
        self.line(5, 5, 205, 5)
        self.set_line_width(0.3)
        self.set_draw_color(0, 0, 0)

    def footer(self):
        pass   # Footer handled manually above


def generate_village_excel(records, village_name="All Villages"):
    """
    Generate a formatted Excel village ledger from land records.
    Includes Bigha and Lecha columns.
    """
    if pd is None:
        raise ImportError("pandas and openpyxl are required.")

    flat_rows = []
    for rec in records:
        loc   = rec.get("location", {})
        attrs = rec.get("attributes", {})
        owner = rec.get("owner", {})
        muts  = rec.get("mutation_history", [])
        last_mut = muts[-1] if muts else {}

        area_ha = float(attrs.get("area_ha", 0) or 0)
        flat_rows.append({
            "ULPIN":                   rec.get("ulpin", ""),
            "Khasra No.":              rec.get("khasra_no", ""),
            "Khata No.":               rec.get("khata_no", ""),
            "State":                   loc.get("state", ""),
            "District":                loc.get("district", ""),
            "Village":                 loc.get("village", ""),
            "Area (Ha)":               area_ha,
            "Area (Bigha - Assam)":    round(area_ha * HA_TO_BIGHA_ASSAM, 2),
            "Area (Lecha - Assam)":    int(round(area_ha * HA_TO_LECHA_ASSAM)),
            "Area (Acres)":            round(area_ha * HA_TO_ACRE, 2),
            "Land Use":                attrs.get("land_use", ""),
            "Circle Rate (INR/Ha)":    attrs.get("circle_rate_inr", 0),
            "Owner Name":              owner.get("name", ""),
            "Share (%)":               owner.get("share_pct", 0),
            "Aadhaar (Masked)":        owner.get("aadhaar_mask", ""),
            "Total Mutations":         len(muts),
            "Last Mutation Date":      last_mut.get("mutation_date", ""),
            "Last Mutation Type":      last_mut.get("mutation_type", ""),
            "Record ID":               rec.get("_id", ""),
        })

    df = pd.DataFrame(flat_rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Village Ledger")
        try:
            ws = writer.sheets["Village Ledger"]
            for idx, col in enumerate(df.columns):
                max_len = max(
                    df[col].astype(str).map(len).max() if len(df) > 0 else 0,
                    len(col)
                )
                col_letter = chr(65 + idx) if idx < 26 else chr(64 + idx // 26) + chr(65 + idx % 26)
                ws.column_dimensions[col_letter].width = min(max_len + 3, 40)
        except Exception:
            pass

    output.seek(0)
    return output.getvalue()


if __name__ == "__main__":
    sample = {
        "_id": "test-001",
        "ulpin": "18011010001001",
        "khasra_no": "42/B",
        "khata_no": "KH-07",
        "location": {"state": "Assam", "district": "Kamrup Metropolitan", "village": "Guwahati Ward 12"},
        "attributes": {"area_ha": 1.34, "land_use": "Agricultural", "circle_rate_inr": 85000},
        "owner": {"name": "Ramesh Kumar", "share_pct": 100, "aadhaar_mask": "XXXX-XXXX-7890"},
        "geometry": {"type": "Polygon", "coordinates": [[[91.76, 26.12], [91.765, 26.12], [91.765, 26.125], [91.76, 26.125], [91.76, 26.12]]]},
        "mutation_history": []
    }
    b = generate_property_card_pdf(sample)
    print(f"PDF generated: {len(b)} bytes")
