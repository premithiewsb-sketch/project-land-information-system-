# LIMS - Land Information Management System (Prototype)

A professional GIS-based land records management platform designed for modern land administration. This system serves as a **functional prototype** demonstrating advanced spatial data handling, role-based security, and automated reporting.

## Key Features

- **Interactive GIS Mapping**: Full-featured mapping interface using Leaflet.js with polygon drawing and spatial validation.
- **Advanced Land Valuation**: Automated property valuation system using dynamic circle rates and land-use multipliers.
- **Comprehensive Reporting**: Generation of high-quality PDF Property Cards and Excel Village Ledgers with embedded QR codes.
- **Secure Administration**: Robust Role-Based Access Control (RBAC) with detailed audit logging and soft-deletion workflows.
- **Public Access**: CAPTCHA-secured read-only viewer for public record verification with sensitive data masking.

## Tech Stack

- **Backend**: Python / Flask
- **Database**: MongoDB (NoSQL) for GeoJSON spatial data storage
- **Frontend**: HTML5, Vanilla CSS, JavaScript
- **Mapping**: Leaflet.js / Leaflet Geoman
- **Logic**: Shapely (GIS Processing), Pandas (Excel), FPDF2 (PDF)

## Quick Start

### 1. Installation
```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configuration
Create a `.env` file in the root directory and configure the following variables:
- `MONGO_URI`: Your MongoDB connection string
- `LIMS_SECRET_KEY`: Secure session key
- `DEFAULT_ADMIN_USER`: Initial bootstrap admin username
- `DEFAULT_ADMIN_PASSWORD`: Initial bootstrap admin password

### 3. Execution
```bash
python app.py
```

## System Roles

1. **Administrator**: Full control over records, user management, and system audits.
2. **Officer**: Operational access for creating, editing, and soft-deleting land records.
3. **Public Viewer**: Read-only access to non-sensitive record data with automated PII masking.

## Testing

The system includes a comprehensive automated test suite. To run all tests and generate a status report:
```bash
python tests/generate_test_report.py
```

---
*Note: This system is a development prototype and is intended for demonstration purposes only.*