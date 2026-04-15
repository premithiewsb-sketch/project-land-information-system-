"""
report_generator.py - Document Generation Module for India LIMS
Generates official PDF Property Cards and Excel Village Ledgers.
"""

import os
import sys
import io
import json
import uuid
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


def generate_property_card_pdf(record, map_image_base64=None):
    """
    Generate an official A4-sized PDF Property Card (Khasra Document) for a land record.

    The PDF includes:
    - Government of India header
    - QR code with ULPIN
    - Property Details table (ULPIN, Khasra No, Area, Land Use, Circle Rate)
    - Ownership Details table (Name, Share, Aadhaar Mask)
    - Mutation History table (if any)
    - Generation timestamp and digital signature placeholder

    Args:
        record: A land record dictionary with all fields.

    Returns:
        bytes: PDF file content as bytes, or None on failure.
    """
    if FPDF is None:
        raise ImportError("fpdf2 library is required. Install with: pip install fpdf2")

    pdf = PropertyCardPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ─── Page 1: Property Card ───────────────────────────────────────────
    pdf.add_page()

    # Generate QR Code
    qr_img = None
    if qrcode is not None:
        try:
            qr = qrcode.QRCode(version=1, box_size=4, border=1)
            qr.add_data(record.get("ulpin", "N/A"))
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white")
        except Exception:
            qr_img = None

    # Save QR code to a temporary buffer and place it
    if qr_img is not None:
        try:
            qr_buffer = io.BytesIO()
            qr_img.save(qr_buffer, format="PNG")
            qr_buffer.seek(0)
            # Save to temp file with unique name for FPDF
            import uuid
            temp_qr_path = os.path.join(os.path.dirname(__file__), f"temp_qr_{uuid.uuid4().hex[:8]}.png")
            with open(temp_qr_path, "wb") as f:
                f.write(qr_buffer.getvalue())
            pdf.image(temp_qr_path, x=170, y=12, w=25, h=25)
            # Clean up temp file
            try:
                os.remove(temp_qr_path)
            except Exception:
                pass
        except Exception:
            pass

    # ─── Header Section ──────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, "Government of India", ln=True, align="C")
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 7, "Department of Revenue - Land Records", ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Ministry of Rural Development", ln=True, align="C")
    pdf.ln(3)

    # State/District/Village line
    loc = record.get("location", {})
    location_str = f"{loc.get('village', 'N/A')}, {loc.get('district', 'N/A')}, {loc.get('state', 'N/A')}"
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, f"Property Card - {location_str}", ln=True, align="C")
    pdf.ln(4)

    # Horizontal rule
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    # ─── Table 1: Property Details ───────────────────────────────────────
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "PROPERTY DETAILS", ln=True)
    pdf.ln(2)

    attrs = record.get("attributes", {})
    prop_data = [
        ["ULPIN", record.get("ulpin", "N/A")],
        ["Khasra No.", record.get("khasra_no", "N/A")],
        ["Khata No.", record.get("khata_no", "N/A")],
        ["Area (Hectares)", str(attrs.get("area_ha", "N/A"))],
        ["Land Use", attrs.get("land_use", "N/A")],
        ["Circle Rate (INR/ha)", f"Rs. {attrs.get('circle_rate_inr', 'N/A'):,}" if isinstance(attrs.get('circle_rate_inr'), (int, float)) else "N/A"],
        ["Location", location_str],
    ]

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(220, 230, 241)
    pdf.cell(65, 8, " Field ", border=1, fill=True)
    pdf.cell(125, 8, " Value ", border=1, fill=True, ln=True)

    pdf.set_font("Helvetica", "", 10)
    for field, value in prop_data:
        pdf.cell(65, 7, f" {field}", border=1)
        pdf.cell(125, 7, f" {value}", border=1, ln=True)

    pdf.ln(6)

    # ─── Table 2: Ownership Details ──────────────────────────────────────
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "OWNERSHIP DETAILS", ln=True)
    pdf.ln(2)

    owner = record.get("owner", {})
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(220, 230, 241)
    pdf.cell(65, 8, " Field ", border=1, fill=True)
    pdf.cell(125, 8, " Value ", border=1, fill=True, ln=True)

    pdf.set_font("Helvetica", "", 10)
    owner_data = [
        ["Owner Name", owner.get("name", "N/A")],
        ["Share (%)", f"{owner.get('share_pct', 'N/A')}%"],
        ["Aadhaar (Masked)", owner.get("aadhaar_mask", "N/A")],
    ]
    for field, value in owner_data:
        pdf.cell(65, 7, f" {field}", border=1)
        pdf.cell(125, 7, f" {value}", border=1, ln=True)

    pdf.ln(6)

    # ─── Table 3: Mutation History ───────────────────────────────────────
    mutations = record.get("mutation_history", [])
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "MUTATION HISTORY", ln=True)
    pdf.ln(2)

    if mutations:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(220, 230, 241)
        col_widths = [38, 25, 30, 30, 30, 37]
        headers = ["Prev. Owner", "Share %", "Mutation Date", "Type", "Reference", "Remarks"]
        for i, h in enumerate(headers):
            pdf.cell(col_widths[i], 7, f" {h}", border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for mut in mutations:
            pdf.cell(col_widths[0], 6, f" {mut.get('previous_owner', 'N/A')}", border=1)
            pdf.cell(col_widths[1], 6, f" {mut.get('previous_share_pct', 'N/A')}%", border=1)
            pdf.cell(col_widths[2], 6, f" {mut.get('mutation_date', 'N/A')}", border=1)
            pdf.cell(col_widths[3], 6, f" {mut.get('mutation_type', 'N/A')}", border=1)
            pdf.cell(col_widths[4], 6, f" {mut.get('mutation_ref', 'N/A')}", border=1)
            pdf.cell(col_widths[5], 6, " -", border=1)
            pdf.ln()
    else:
        pdf.set_font("Helvetica", "I", 10)
        pdf.cell(0, 7, "No mutation records on file.", ln=True)

    pdf.ln(8)

    # ─── Property Map ────────────────────────────────────────────────────
    if map_image_base64:
        # Check remaining space, if less than 80mm, add a new page
        remaining_space = 277 - pdf.get_y()  # 297 (A4 height) - 20 (bottom margin)
        if remaining_space < 80:
            pdf.add_page()
            pdf.set_y(15)  # Start from top with small margin

        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "PROPERTY MAP", ln=True)
        pdf.ln(2)

        import base64
        import tempfile
        import struct
        try:
            # Decode base64 (remove data:image/png;base64, prefix if exists)
            if "," in map_image_base64:
                map_image_base64 = map_image_base64.split(",")[1]
            img_data = base64.b64decode(map_image_base64)

            temp_map_path = os.path.join(tempfile.gettempdir(), f"map_{record.get('ulpin')}_{uuid.uuid4().hex[:8]}.png")
            with open(temp_map_path, "wb") as f:
                f.write(img_data)

            # Read PNG dimensions manually using struct (no external dependencies)
            try:
                with open(temp_map_path, 'rb') as f:
                    # PNG signature is 8 bytes, then IHDR chunk
                    f.read(8)  # Skip PNG signature
                    # Read IHDR chunk (must be first chunk)
                    chunk_data = f.read(17)  # 4 bytes length + 4 bytes type + 9 bytes data (width=4, height=4, etc)
                    if len(chunk_data) == 17:
                        img_width = struct.unpack('>I', chunk_data[8:12])[0]
                        img_height = struct.unpack('>I', chunk_data[12:16])[0]
                        
                        # Calculate scaled dimensions to fit within page
                        max_width = 170  # Leave 20mm margins on each side
                        max_height = min(80, remaining_space - 10)  # Leave some space for footer
                        
                        # Scale proportionally
                        scale = min(max_width / img_width, max_height / img_height)
                        scaled_width = img_width * scale
                        scaled_height = img_height * scale
                        
                        # Center the image
                        x_pos = (210 - scaled_width) / 2
                        pdf.image(temp_map_path, x=x_pos, w=scaled_width)
                        pdf.ln(scaled_height + 3)
                    else:
                        # Fallback if can't read dimensions
                        pdf.image(temp_map_path, x=20, w=170)
                        pdf.ln(80)
            except Exception:
                # Fallback if PNG reading fails
                pdf.image(temp_map_path, x=20, w=170)
                pdf.ln(80)

            try:
                os.remove(temp_map_path)
            except Exception:
                pass
        except Exception as e:
            pdf.set_font("Helvetica", "I", 10)
            pdf.cell(0, 7, f"Error rendering map: {e}", ln=True)

        pdf.ln(2)

    # ─── Footer Section ──────────────────────────────────────────────────
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    pdf.set_font("Helvetica", "I", 8)
    gen_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pdf.cell(0, 5, f"Generated: {gen_time} | Document ID: PC-{record.get('ulpin', 'N/A')}-{datetime.now().strftime('%Y%m%d%H%M')}", ln=True)

    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 6, "This is a computer-generated document. No physical signature is required.", ln=True, align="C")
    pdf.cell(0, 6, "For verification, scan the QR code or contact the local Revenue Office.", ln=True, align="C")

    # Output as bytes
    try:
        return bytes(pdf.output())
    except Exception:
        # fpdf2 returns bytes or bytearray depending on version
        output = pdf.output()
        if isinstance(output, (bytes, bytearray)):
            return bytes(output)
        # If it returns a string (older fpdf), encode it
        return output.encode("latin-1") if isinstance(output, str) else bytes(output)


class PropertyCardPDF(FPDF):
    """Custom FPDF class for the Property Card with header/footer."""

    def header(self):
        # Thin decorative line at the very top
        self.set_draw_color(0, 51, 102)
        self.set_line_width(1.0)
        self.line(5, 5, 205, 5)
        self.set_line_width(0.3)
        self.set_draw_color(0, 0, 0)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"India LIMS - Land Information Management System | Page {self.page_no()}/{{nb}}", align="C")
        self.set_text_color(0, 0, 0)


def generate_village_excel(records, village_name="All Villages"):
    """
    Generate a formatted Excel (.xlsx) village ledger from land records.

    Flattens the nested JSON structure into a tabular format suitable for
    government records and revenue audits.

    Args:
        records: List of land record dictionaries.
        village_name: Name of the village for the sheet title.

    Returns:
        bytes: Excel file content as bytes, or None on failure.
    """
    if pd is None:
        raise ImportError("pandas library is required. Install with: pip install pandas openpyxl")

    # Flatten records into tabular format
    flat_rows = []
    for rec in records:
        loc = rec.get("location", {})
        attrs = rec.get("attributes", {})
        owner = rec.get("owner", {})
        mutations = rec.get("mutation_history", [])
        mutation_count = len(mutations)
        last_mutation = mutations[-1] if mutations else {}

        flat_rows.append({
            "ULPIN": rec.get("ulpin", ""),
            "Khasra No.": rec.get("khasra_no", ""),
            "Khata No.": rec.get("khata_no", ""),
            "State": loc.get("state", ""),
            "District": loc.get("district", ""),
            "Village": loc.get("village", ""),
            "Area (Ha)": attrs.get("area_ha", 0),
            "Land Use": attrs.get("land_use", ""),
            "Circle Rate (INR)": attrs.get("circle_rate_inr", 0),
            "Owner Name": owner.get("name", ""),
            "Share (%)": owner.get("share_pct", 0),
            "Aadhaar (Masked)": owner.get("aadhaar_mask", ""),
            "Total Mutations": mutation_count,
            "Last Mutation Date": last_mutation.get("mutation_date", ""),
            "Last Mutation Type": last_mutation.get("mutation_type", ""),
            "Record ID": rec.get("_id", ""),
        })

    df = pd.DataFrame(flat_rows)

    # Write to Excel with formatting
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Village Ledger")

        # Auto-adjust column widths
        try:
            worksheet = writer.sheets["Village Ledger"]
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).map(len).max() if len(df) > 0 else 0,
                    len(col)
                )
                adjusted_width = min(max_length + 3, 40)
                worksheet.column_dimensions[chr(65 + idx) if idx < 26 else chr(64 + idx // 26) + chr(65 + idx % 26)].width = adjusted_width
        except Exception:
            pass  # Column width adjustment is best-effort

    output.seek(0)
    return output.getvalue()


if __name__ == "__main__":
    # Quick test: generate a sample PDF
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    sample_record = {
        "_id": "test-001",
        "ulpin": "23010203004005",
        "khasra_no": "101/2/A",
        "khata_no": "KH-88",
        "location": {"state": "Madhya Pradesh", "district": "Bhopal", "village": "Berasia"},
        "attributes": {"area_ha": 1.23, "land_use": "Agricultural", "circle_rate_inr": 45000},
        "owner": {"name": "Ramesh Kumar Sharma", "share_pct": 100, "aadhaar_mask": "XXXX-XXXX-1234"},
        "mutation_history": []
    }
    pdf_bytes = generate_property_card_pdf(sample_record)
    if pdf_bytes:
        print(f"Sample PDF generated: {len(pdf_bytes)} bytes")
    else:
        print("PDF generation failed.")
