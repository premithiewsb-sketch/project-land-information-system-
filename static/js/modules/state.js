/**
 * state.js - Global state for India LIMS
 */

let map = null;
let viewRecordMap = null;
let addRecordMap = null;
let addRecordDrawnItems = null;
let baseLayers = {};
let currentBaseLayer = null;
let parcelLayers = [];
let drawnItems = null;
let currentSketchLayer = null;
let isAdmin = false;
let selectedRecordId = null;
let selectedRecord = null;
let reverseGeocodeTimer = null;
let lastGeocodeKey = '';
let lastAutoLocation = { state: '', district: '', village: '' };
let lastGpsDetectedLocation = { state: '', district: '', village: '' };
let allRecordsCache = [];
let filteredRecordsCache = [];
let recordsViewMode = 'cards';
let locationCatalog = {};
let currentProfile = null;
let allUsers = [];
let sessionUsername = '';

const DEFAULT_SNAP_DISTANCE = 20;
