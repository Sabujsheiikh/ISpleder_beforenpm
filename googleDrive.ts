
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_DISCOVERY_DOCS, GOOGLE_SCOPES, BACKUP_FILE_NAME } from '../constants';
import { GlobalState } from '../types';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Global Window Extension for Google APIs
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export const initGoogleServices = async (callback: (isInited: boolean) => void) => {
  // 1. Offline Check: Immediately return false if offline
  if (!navigator.onLine) {
    console.warn("Offline: Skipping Google Services initialization.");
    callback(false);
    return;
  }

  // 2. Check if scripts loaded successfully (they might fail if adblocker/network error)
  if (!window.gapi || !window.google) {
      console.warn("Google Scripts not loaded in window.");
      callback(false);
      return;
  }

  if (gapiInited && gisInited) {
      callback(true);
      return;
  }

  try {
      // Init GAPI Client
      const gapiLoaded = new Promise<void>((resolve, reject) => {
        window.gapi.load('client', async () => {
          try {
              await window.gapi.client.init({
                  apiKey: GOOGLE_API_KEY, 
                  discoveryDocs: GOOGLE_DISCOVERY_DOCS,
              });
              gapiInited = true;
              resolve();
          } catch (err) {
              console.error("GAPI Init Error:", err);
              reject(err);
          }
        });
      });

      // Init GIS (Google Identity Services)
      const gisLoaded = new Promise<void>((resolve, reject) => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            callback: '', // defined at request time
        });
        gisInited = true;
        resolve();
      });

      await Promise.all([gapiLoaded, gisLoaded]);
      callback(true);
  } catch (error) {
      console.error("Failed to initialize Google Services:", error);
      callback(false);
  }
};

export const handleAuthClick = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject("Token Client not initialized. Are you offline?");

    tokenClient.callback = async (resp: any) => {
      if (resp.error !== undefined) {
        reject(resp);
      }
      resolve();
    };

    if (window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
};

export const handleSignoutClick = () => {
  if (!window.gapi || !window.google) return;
  const token = window.gapi.client.getToken();
  if (token !== null) {
    window.google.accounts.oauth2.revoke(token.access_token);
    window.gapi.client.setToken('');
  }
};

// Check if backup file exists in AppData folder
const findBackupFile = async () => {
  try {
    const response = await window.gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'nextPageToken, files(id, name)',
      q: `name = '${BACKUP_FILE_NAME}'`,
      pageSize: 10,
    });
    const files = response.result.files;
    if (files && files.length > 0) {
      return files[0].id; // Return ID of first match
    }
    return null;
  } catch (err) {
    console.error("Error finding file", err);
    throw err;
  }
};

// Upload (Create or Update)
export const saveToDrive = async (data: GlobalState): Promise<void> => {
  if (!gapiInited) throw new Error("Google Services not initialized");
  
  const fileContent = JSON.stringify(data);
  const fileId = await findBackupFile();

  const fileMetadata = {
    name: BACKUP_FILE_NAME,
    mimeType: 'application/json',
    parents: !fileId ? ['appDataFolder'] : undefined, // Only set parent on creation
  };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const contentType = 'application/json';

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(fileMetadata) +
    delimiter +
    'Content-Type: ' + contentType + '\r\n\r\n' +
    fileContent +
    close_delim;

  const request = window.gapi.client.request({
    path: fileId ? `/upload/drive/v3/files/${fileId}` : '/upload/drive/v3/files',
    method: fileId ? 'PATCH' : 'POST',
    params: { uploadType: 'multipart' },
    headers: {
      'Content-Type': 'multipart/related; boundary="' + boundary + '"'
    },
    body: multipartRequestBody
  });

  return new Promise((resolve, reject) => {
    request.execute((file: any) => {
      if (file.error) {
        reject(file.error);
      } else {
        resolve();
      }
    });
  });
};

// Download
export const loadFromDrive = async (): Promise<GlobalState | null> => {
  if (!gapiInited) throw new Error("Google Services not initialized");
  
  const fileId = await findBackupFile();
  if (!fileId) return null;

  try {
    const response = await window.gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });
    return response.result as GlobalState; // drive.files.get with alt=media returns the body
  } catch (err) {
    console.error("Error downloading file", err);
    throw err;
  }
};