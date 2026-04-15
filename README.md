# India LIMS - Land Information Management System

A GIS-based land records management web application built with **Flask (Python)** backend and Leaflet mapping frontend.

## Architecture

**Python does the heavy lifting:**
- Server-side filtering with `/api/records/filter`
- Dashboard analytics aggregation with `/api/dashboard`
- Location catalog generation with `/api/location-catalog`
- Spatial calculations (Shapely) via `gis_processor.py`
- PDF/Excel document generation via `report_generator.py`
- Authentication & session management

**Frontend focuses on:**
- Interactive Leaflet maps with Geoman drawing
- Tab-based UI (Records, Map View, Add Record, Dashboard)
- Real-time form validation
- Responsive design

## Project Structure

```
india-lims/
├── app.py                  # Flask REST API server (800+ lines)
├── config.py               # Centralized configuration
├── utils.py                # Shared utility functions
├── gis_processor.py        # Spatial calculations (Shapely)
├── report_generator.py     # PDF/Excel document generation
├── build_exe.py            # PyInstaller build script
├── requirements.txt        # Python dependencies
├── .gitignore              # Git ignore rules
│
├── static/
│   ├── css/style.css       # Custom styles
│   └── js/
│       ├── api.js          # API fetch wrappers + server-side endpoints
│       ├── auth.js         # Login/CAPTCHA handlers
│       └── map.js          # Leaflet map + admin workflow
│
├── templates/
│   ├── login.html          # Dual-form login (admin + CAPTCHA)
│   ├── admin_dashboard.html # Admin dashboard (tab-based)
│   └── public_viewer_v2.html # Public read-only viewer with filters
│
└── data/
    ├── users.json          # Admin users (auto-created)
    └── records.json        # Land records (auto-created)
```

## Setup

### Prerequisites
- Python 3.10+
- Virtual environment (recommended)

### Installation
```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

### Default Credentials
- **Username:** admin
- **Password:** password123

## API Endpoints

### Authentication
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/login` | Public | Admin login |
| POST | `/api/verify-captcha` | Public | CAPTCHA verification |
| POST | `/api/logout` | Auth | Logout |
| GET | `/api/session-info` | Auth | Current session info |

### Records (Python-heavy)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/records` | Auth | All records |
| POST | `/api/records` | Admin | Create record |
| PUT | `/api/records/<id>` | Admin | Update record |
| DELETE | `/api/records/<id>` | Admin | Delete record |
| GET | `/api/records/filter` | Auth | **Server-side filtering** |
| GET | `/api/records/search` | Auth | Text search |

### Analytics (Python-heavy)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/dashboard` | Admin | **Pre-computed KPIs & analytics** |
| GET | `/api/location-catalog` | Auth | **State > district > village hierarchy** |
| GET | `/api/config` | Public | App configuration (colors, options) |

### GIS Processing
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/calculate-area` | Auth | Area/perimeter/centroid calculation |
| POST | `/api/validate-geometry` | Auth | Polygon validation |
| GET | `/api/location-from-coords` | Auth | Reverse geocoding |

### Documents
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/print-card/<ulpin>` | Auth | PDF property card |
| GET | `/api/export-village` | Admin | Excel village ledger |

## Configuration

Environment variables:
```bash
LIMS_SECRET_KEY=your-secret-key
LIMS_DEBUG=true
LIMS_HOST=0.0.0.0
LIMS_PORT=5000
```

## Building Executable

```bash
python build_exe.py
```
Output: `dist/IndiaLIMS.exe`

## Web Deployment (e.g. Render)

To deploy India LIMS on a cloud platform like **Render**:

1. Ensure the `MONGO_URI` is correctly set in your environment variables.
2. In your Render Web Service settings, use the following **Start Command**:
   ```bash
   gunicorn app:app
   ```
3. Set your internal port mapping to match `LIMS_PORT` or the default `5000`.

**Uptime Monitoring / Health Checks:**
You can keep the app awake using UptimeRobot or similar services by pinging the dedicated health-check endpoint every few minutes:
- Endpoint: `GET /ping`
- Returns: `{"status": "alive"}` (Status 200 OK)

## Features

### Mobile-Responsive Design
- **Admin & Public Views** - Fully responsive for desktop, tablet, and mobile devices
- **Collapsible Drawers** - Mobile-friendly hamburger menus and slide-out sidebars
- **Adaptive Layouts** - Filters, data tables, and mapping interfaces adapt to small screens seamlessly.

### Admin Dashboard
- **Records tab** - List view with server-side filtering, card/table toggle
- **Map View tab** - Full-screen map with all parcels, layer switching (OSM/Google/ESRI)
- **Add Record tab** - Split view: draw polygon + form side-by-side
- **View Record tab** - Large map (2/3) with details panel (1/3)
- **Dashboard tab** - Server-computed KPIs, land use distribution, district overview

### Public Viewer
- Read-only access via  CAPTCHA
- Server-side filter dropdowns (State, District, Village, Land Type)
- Text search across Khasra, ULPIN, Plot No
- Masked owner information

## License

MIT
