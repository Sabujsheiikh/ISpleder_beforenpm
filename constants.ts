
import { AppSettings } from './types';

// ==========================================================
// GOOGLE CLOUD CONFIGURATION (REQUIRED FOR SYNC)
// 1. Go to console.cloud.google.com
// 2. Create a project and enable "Google Drive API"
// 3. Create Credentials -> OAuth Client ID.
//    NOTE: For Electron Desktop App:
//    - Choose "Desktop App" Application Type.
//    - No Redirect URI is required for Desktop App type in the console.
//    - Copy the Client ID below.
// ==========================================================
export const GOOGLE_CLIENT_ID = '713674385376-1ok4njd4mlc9rtbedljpgofkn7ibejjc.apps.googleusercontent.com'; 
export const GOOGLE_API_KEY = 'AIzaSyB3SGoe6N-uejnBhDWtmuaNGKIBoI093JQ'; 

export const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.appdata";
export const BACKUP_FILE_NAME = "kams_db_backup.json";

export const DEFAULT_HEADERS: Record<string, string> = {
  slNo: 'SL No',
  displayClientId: 'Client ID',
  username: 'Username',
  name: 'Client Name',
  isActive: 'Active',
  clientType: 'Client Type',
  lineType: 'Line Type', 
  bandwidthPackage: 'Package', 
  contact: 'Contact Number',
  address: 'Full Address',
  area: 'Area',
  monthKey: 'Bill Month',
  paymentDate: 'Payment Date',
  payable: 'Payable',
  paid: 'Paid',
  status: 'Payment Status',
  receiptNo: 'Receipt No',
  overdue: 'Overdue (Months)',
  remarks: 'Remarks'
};

export const DEFAULT_COLUMN_ORDER = [
  'slNo',
  'displayClientId',
  'username',
  'name',
  'isActive',
  'clientType',
  'lineType', 
  'bandwidthPackage', 
  'contact',
  'address',
  'area',
  'payable',
  'paid',
  'status',
  'receiptNo',
  'overdue',
  'remarks',
  'actions'
];

export const EXPENSE_CATEGORIES = [
  'Bandwidth Bill',
  'Fiber Equipment',
  'Salary',
  'Office Rent',
  'Electricity',
  'Owner Profit (∆)', 
  'Other'
];

// ==========================================================
// SECURITY CONFIGURATION
// Change the string inside quotes below to set a new default password.
// ==========================================================
const DEFAULT_PASSWORD_PLAIN = 'admin'; 

// Internal Helper to encode password (Do not change)
const encodePwd = (str: string) => {
  try { return btoa(str); } catch (e) { 
    // Fix: Handle Buffer type definition error by accessing via globalThis
    const buffer = (globalThis as any).Buffer;
    if (buffer) return buffer.from(str).toString('base64');
    return str;
  }
};

export const DEFAULT_PASSWORD_HASH = encodePwd(DEFAULT_PASSWORD_PLAIN);

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'ISPLedger',
  companyTagline: 'Professional ISP Management',
  companyAddress: '',
  userName: 'Admin',
  currencySymbol: '৳',
  theme: 'system',
  brandColor: 'blue',
  customHeaders: DEFAULT_HEADERS,
  columnOrder: DEFAULT_COLUMN_ORDER,
  dynamicFields: [],
  passwordHash: DEFAULT_PASSWORD_HASH,
  
  // Default Security Question
  securityQuestion: "What is your pet's name?",
  securityAnswerHash: DEFAULT_PASSWORD_HASH, // Default answer matches the password

  autoBackupEnabled: true,
  localBackupEnabled: true,
  cloudBackupEnabled: false,
  autoUpdateEnabled: true,
  lastBackupDate: '',
  maxDueDate: 10, 
  googleCloudConnected: false,
  
  bandwidthPackages: [
    { id: '1', name: '5 Mbps', bandwidth: '5 Mbps', price: 500, remark: 'Starter' },
    { id: '2', name: '10 Mbps', bandwidth: '10 Mbps', price: 800, remark: 'Standard' },
    { id: '3', name: '15 Mbps', bandwidth: '15 Mbps', price: 1000, remark: 'Gaming' },
    { id: '4', name: '20 Mbps', bandwidth: '20 Mbps', price: 1200, remark: 'Streamer' }
  ]
};

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const STORAGE_KEY = 'kams_enterprise_db_v1';
export const AUTH_KEY = 'kams_auth_session';