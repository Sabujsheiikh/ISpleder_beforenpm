import React, { useState, useEffect } from 'react';
import { GlobalState, Client, MonthlyRecord, ExpenseTransaction, ToastType, ThemeColor } from '../types';
import { GOOGLE_CLIENT_ID } from '../constants';
import { Settings as SettingsIcon, Save, RefreshCw, Plus, Trash2, Download, Layers, Cloud, CloudUpload, CloudDownload, LogOut, CheckCircle, User, Shield, Layout, Database, AlertTriangle, HardDrive, Zap, Wifi, Palette, Columns, Lock, Server, FileDown, Search, DownloadCloud } from '../components/ui/Icons';
import { exportData } from '../services/db';
import { handleAuthClick, handleSignoutClick, initGoogleServices, saveToDrive, loadFromDrive } from '../services/googleDrive';
import { sendToHost, onMessageFromHost, isWebView2 } from '../services/bridge';

interface SettingsProps {
  state: GlobalState;
  updateState: (newState: GlobalState) => void;
  addToast?: (type: ToastType, msg: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ state, updateState, addToast }) => {
  const [activeTab, setActiveTab] = useState<'security' | 'backup' | 'updates'>('updates');
  
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Security Question
  const [securityQuestion, setSecurityQuestion] = useState(state.settings.securityQuestion || "What is your pet's name?");
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Cloud State
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Update State
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Monitor Online/Offline Status
  useEffect(() => {
      const handleStatusChange = () => {
          const online = navigator.onLine;
          setIsOnline(online);
          if (online && !isGoogleReady) {
              initGoogleServices((inited) => setIsGoogleReady(inited));
          }
      };

      window.addEventListener('online', handleStatusChange);
      window.addEventListener('offline', handleStatusChange);

      if (navigator.onLine) {
        initGoogleServices((inited) => setIsGoogleReady(inited));
      }

      return () => {
          window.removeEventListener('online', handleStatusChange);
          window.removeEventListener('offline', handleStatusChange);
      }
  }, [isGoogleReady]);

  // Update Listeners via Bridge
  useEffect(() => {
      const handler = (data: any) => {
          if (data.type === 'update_checking') {
              setUpdateStatus('checking');
              setUpdateMessage('Checking for updates...');
          }
          if (data.type === 'update_available') {
              setUpdateStatus('available');
              setUpdateMessage('New version found. Starting download...');
          }
          if (data.type === 'up_to_date') {
              setUpdateStatus('idle');
              setUpdateMessage('System is up to date.');
              setTimeout(() => setUpdateMessage(''), 3000);
          }
          if (data.type === 'update_progress') {
              setUpdateStatus('downloading');
              setUpdateMessage('Downloading update...');
              setDownloadProgress(data.percent);
          }
          if (data.type === 'update_downloaded') {
              setUpdateStatus('ready');
              setUpdateMessage('Update ready to install.');
          }
          if (data.type === 'update_error') {
              setUpdateStatus('error');
              setUpdateMessage('Error: ' + (data.message || 'Update failed'));
          }
      };

      onMessageFromHost(handler);
  }, []);

  const checkForUpdates = () => {
      if (!isWebView2()) {
          if (addToast) addToast('info', 'Updates only available in Desktop App mode.');
          return;
      }
      try {
          (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'check_update' }));
      } catch (e) {
          console.warn('check_update post failed', e);
      }
  };

  const installUpdate = () => {
      try {
          (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'start_update' }));
      } catch (e) {
          console.warn('start_update post failed', e);
      }
  };

  const handleChangePassword = () => {
    if (btoa(password) === state.settings.passwordHash) {
      if(newPassword.length < 4) {
          if(addToast) addToast('warning', "Password too short");
          return;
      }
      updateState({
        ...state,
        settings: { ...state.settings, passwordHash: btoa(newPassword) }
      });
      if(addToast) addToast('success', 'Password updated');
      setPassword('');
      setNewPassword('');
    } else {
      if(addToast) addToast('error', 'Current password incorrect');
    }
  };

  const handleSaveSecurityQuestion = () => {
      if(!securityAnswer) {
          if(addToast) addToast('warning', "Please enter an answer to save");
          return;
      }
      
      updateState({
          ...state,
          settings: {
              ...state.settings,
              securityQuestion: securityQuestion,
              securityAnswerHash: btoa(securityAnswer)
          }
      });
      if(addToast) addToast('success', 'Recovery question updated successfully');
      setSecurityAnswer('');
  };

  const handleMergeImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const json = JSON.parse(evt.target?.result as string);
          mergeDataLogic(json);
        } catch (err) {
          if(addToast) addToast('error', "Invalid backup file.");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const mergeDataLogic = (json: any) => {
      if (json.clients && json.records) {
            const mergedClients = [...state.clients];
            let newClientsCount = 0;
            (json.clients as Client[]).forEach(c => {
              const existingIndex = mergedClients.findIndex(ex => ex.id === c.id);
              if (existingIndex >= 0) {
                 mergedClients[existingIndex] = c;
              } else {
                 mergedClients.push(c);
                 newClientsCount++;
              }
            });

            const mergedRecords = [...state.records];
            let newRecordsCount = 0;
            (json.records as MonthlyRecord[]).forEach(r => {
              const existingIndex = mergedRecords.findIndex(ex => ex.id === r.id);
              if (existingIndex >= 0) {
                 mergedRecords[existingIndex] = r;
              } else {
                 mergedRecords.push(r);
                 newRecordsCount++;
              }
            });

            const mergedExpenses = [...state.expenses];
            (json.expenses as ExpenseTransaction[]).forEach(ex => {
              const existingIndex = mergedExpenses.findIndex(e => e.id === ex.id);
              if (existingIndex >= 0) {
                 mergedExpenses[existingIndex] = ex;
              } else {
                 mergedExpenses.push(ex);
              }
            });

            updateState({
              ...state,
              clients: mergedClients,
              records: mergedRecords,
              expenses: mergedExpenses,
            });

            if(addToast) addToast('success', `Merged: ${newClientsCount} clients, ${newRecordsCount} records.`);
      } else {
            if(addToast) addToast('error', "Invalid data structure.");
      }
  };

  // --- GOOGLE CLOUD HANDLERS ---
    const handleGoogleConnect = async () => {
            if(!isOnline) {
                    if(addToast) addToast('warning', "Offline: Cannot connect to Google.");
                    return;
            }
            // If running inside the desktop host prefer host-driven OAuth (loopback/DPAPI)
                if ((window as any).chrome?.webview) {
                    try {
                        (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'google_auth' }));
                        if(addToast) addToast('info', 'Opening Google auth in host...');
                    } catch (ex) {
                        console.error('Host auth post failed', ex);
                        if(addToast) addToast('error', 'Host auth failed to start');
                    }
                    return;
                }

            if(GOOGLE_CLIENT_ID.includes("YOUR_")) {
                    if(addToast) addToast('error', "API Keys not configured in code!");
                    return;
            }
            try {
                await handleAuthClick();
                updateState({ ...state, settings: { ...state.settings, googleCloudConnected: true } });
                if(addToast) addToast('success', "Connected to Google Drive");
            } catch (err) {
                console.error(err);
                if(addToast) addToast('error', "Connection Failed or Cancelled");
            }
    };

  const handleCloudBackup = async () => {
      if(!isOnline) {
          if(addToast) addToast('warning', "Offline: Cannot backup to Cloud.");
          return;
      }
      if(!isGoogleReady) {
          if(addToast) addToast('error', "Google Services not ready. Check internet.");
          return;
      }
      
      setIsSyncing(true);
      try {
                // If running in the desktop host prefer host upload
                if ((window as any).chrome?.webview) {
                    (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'drive_upload' }));
                    if(addToast) addToast('info', 'Requested host to upload latest backup');
                } else {
                        await saveToDrive(state);
                        const now = new Date().toISOString();
                        updateState({ ...state, settings: { ...state.settings, lastCloudSync: now } });
                        if(addToast) addToast('success', "Backup uploaded to Cloud");
                }
      } catch (err) {
        console.error(err);
        if(addToast) addToast('error', "Backup Failed");
      } finally {
        setIsSyncing(false);
      }
  };

  // Listen for host messages when running inside WebView2 (Google/Drive results)
  React.useEffect(() => {
      if (!(window as any).chrome?.webview) return;
      const handler = (data: any) => {
          if (!data) return;
          try {
              if (data.type === 'google_auth_result') {
                  if (data.success) {
                      updateState({ ...state, settings: { ...state.settings, googleCloudConnected: true } });
                      if(addToast) addToast('success', 'Google authenticated (host)');
                  } else {
                      if(addToast) addToast('error', 'Google auth failed (host)');
                  }
              }
              if (data.type === 'drive_upload_result') {
                  if (data.success) {
                      if(addToast) addToast('success', 'Backup uploaded by host');
                  } else {
                      if(addToast) addToast('error', data.message || 'Host upload failed');
                  }
              }
              if (data.type === 'drive_download_result') {
                  if (data.success) {
                      // Host injected into localStorage and reloaded — just notify
                      if(addToast) addToast('success', 'Backup restored by host');
                  } else {
                      if(addToast) addToast('error', data.message || 'Host download failed');
                  }
              }
              if (data.type === 'drive_list_result') {
                  if (data.files && Array.isArray(data.files)) {
                      // Simple notification — more UI can be built to pick files
                      if(addToast) addToast('info', `Host returned ${data.files.length} backup(s)`);
                  }
              }
          } catch (e) { }
      };
      // wire into existing bridge helper if available
      try { (window as any).chrome.webview.addEventListener('message', (ev: any) => handler(ev.data)); } catch { }
      return () => { /* nothing to cleanup for this simple handler */ };
  }, [state]);

  return (
    <div className="flex flex-col h-full animate-fade-in space-y-4 pb-20">
      <div className="flex justify-between items-center mb-2 shrink-0">
        <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <SettingsIcon size={24} className="text-brand-600" />
                System Settings
            </h1>
            <p className="text-sm text-gray-500">Manage security, backups, cloud connections, and software updates.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
          
          {/* Sidebar Navigation */}
          <div className="w-full md:w-64 flex flex-col gap-2 shrink-0">
              {[
                { id: 'security', label: 'Security & Recovery', icon: Lock },
                { id: 'backup', label: 'Backup & Cloud Sync', icon: Database }, 
                { id: 'updates', label: 'Software Updates', icon: Zap },
              ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-3 transition-all ${
                        activeTab === item.id 
                        ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm border border-brand-100 dark:border-brand-900 ring-1 ring-brand-50 dark:ring-brand-900' 
                        : 'text-gray-500 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                      <item.icon size={18} /> {item.label}
                  </button>
              ))}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 bg-gray-50/50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
              <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
                  
                  {/* WRAPPER FOR IDENTICAL WIDTH */}
                  <div className="max-w-xl w-full mx-auto space-y-6">

                      {activeTab === 'security' && (
                          <div className="space-y-6 animate-fade-in">
                              {/* Admin Access Card */}
                              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
                                      <Lock size={18} className="text-brand-600"/> Admin Access Control
                                  </h3>
                                  <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Current Key</label>
                                        <input type="password" placeholder="Current Access Key" className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none transition-shadow text-sm" value={password} onChange={e => setPassword(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">New Key</label>
                                        <input type="password" placeholder="New Access Key" className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none transition-shadow text-sm" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                    </div>
                                    <button onClick={handleChangePassword} className="w-full bg-gray-800 hover:bg-gray-900 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-gray-500/20 transition-transform active:scale-[0.98]">
                                        Update Access Key
                                    </button>
                                  </div>
                              </div>

                              {/* Recovery Card */}
                              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                 <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
                                     <Shield size={18} className="text-brand-600"/> Account Recovery
                                 </h3>
                                 <div className="space-y-4">
                                     <div>
                                         <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Security Question</label>
                                         <input 
                                             type="text" 
                                             placeholder="e.g., Pet's Name" 
                                             className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none text-sm" 
                                             value={securityQuestion}
                                             onChange={e => setSecurityQuestion(e.target.value)} 
                                         />
                                     </div>
                                     <div>
                                         <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Security Answer</label>
                                         <input 
                                             type="password" 
                                             placeholder="Your Answer" 
                                             className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none text-sm" 
                                             value={securityAnswer}
                                             onChange={e => setSecurityAnswer(e.target.value)} 
                                         />
                                     </div>
                                     <button onClick={handleSaveSecurityQuestion} className="w-full bg-brand-50 hover:bg-brand-100 text-brand-600 border border-brand-200 py-3 rounded-xl font-bold text-sm transition-colors">
                                         Update Recovery Settings
                                     </button>
                                 </div>
                              </div>
                          </div>
                      )}

                      {activeTab === 'backup' && (
                          <div className="space-y-6 animate-fade-in">
                              {/* Local Backup Section */}
                              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                  <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2 text-lg"><HardDrive size={20} className="text-gray-500"/> Local Backup</h4>
                                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-100 dark:border-gray-600">
                                     <div>
                                         <h5 className="font-bold text-sm text-gray-700 dark:text-gray-200">Daily Auto-Backup</h5>
                                         <p className="text-xs text-gray-500 mt-0.5">Saves a copy to your device daily (Rolling 10 days).</p>
                                     </div>
                                     <label className="relative inline-flex items-center cursor-pointer">
                                         <input type="checkbox" className="sr-only peer" checked={state.settings.localBackupEnabled ?? true} onChange={() => updateState({...state, settings: {...state.settings, localBackupEnabled: !state.settings.localBackupEnabled}})} />
                                         <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-green-600"></div>
                                     </label>
                                  </div>
                              </div>

                              {/* Cloud Sync Section */}
                              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                                    <Cloud size={100} className="text-blue-600"/>
                                </div>
                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div>
                                        <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-1 text-lg"><Cloud size={20} className="text-blue-600"/> Google Drive Sync</h4>
                                        <p className="text-xs text-gray-500">Sync database to your Google Drive AppData folder.</p>
                                    </div>
                                    {state.settings.googleCloudConnected ? (
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200 flex items-center gap-1"><CheckCircle size={12}/> Linked</span>
                                    ) : (
                                        <button onClick={handleGoogleConnect} disabled={!isOnline} className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 transition-colors font-bold disabled:opacity-50 flex items-center gap-2">
                                            {isOnline ? 'Connect Account' : <><Wifi size={12} className="text-red-500"/> Offline</>}
                                        </button>
                                    )}
                                </div>
                                
                                {state.settings.googleCloudConnected && (
                                    <div className="grid grid-cols-2 gap-4 relative z-10">
                                        <button onClick={handleCloudBackup} disabled={isSyncing || !isOnline} className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isSyncing ? <RefreshCw size={16} className="animate-spin"/> : <CloudUpload size={16}/>} Upload Backup
                                        </button>
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    setIsSyncing(true);
                                                        if ((window as any).chrome?.webview) {
                                                        // Ask host to list drive backups so user can choose via host UI
                                                        (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'drive_list' }));
                                                        if(addToast) addToast('info', 'Requested backups list from host');
                                                    } else {
                                                        const loadedState = await loadFromDrive();
                                                        if (loadedState) {
                                                            updateState(loadedState);
                                                            if(addToast) addToast('success', "Data restored from Cloud");
                                                        }
                                                    }
                                                } catch (err) {
                                                    console.error(err);
                                                    if(addToast) addToast('error', "Restore Failed");
                                                } finally {
                                                    setIsSyncing(false);
                                                }
                                            }} 
                                            disabled={isSyncing || !isOnline} 
                                            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 py-3 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isSyncing ? <RefreshCw size={16} className="animate-spin"/> : <CloudDownload size={16}/>} Restore From Cloud
                                        </button>
                                    </div>
                                )}
                                {state.settings.lastCloudSync && (
                                    <p className="text-[10px] text-gray-400 mt-4 text-center font-medium">Last synced: {new Date(state.settings.lastCloudSync).toLocaleString()}</p>
                                )}
                              </div>

                              {/* Manual Actions */}
                              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                   <h4 className="font-bold text-gray-800 dark:text-white mb-4 text-lg flex items-center gap-2"><Layers size={20} className="text-gray-500"/> Manual Operations</h4>
                                   <div className="grid grid-cols-2 gap-4">
                                      <button onClick={() => { exportData(state); addToast && addToast('info', 'Downloading...'); }} className="flex items-center justify-center gap-2 py-3 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-bold transition-colors bg-white dark:bg-gray-800">
                                          <Download size={16}/> Export JSON
                                      </button>
                                      <div className="relative">
                                          <input type="file" id="mergeFile" accept=".json" className="hidden" onChange={handleMergeImport} />
                                          <label htmlFor="mergeFile" className="flex items-center justify-center gap-2 py-3 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-bold transition-colors cursor-pointer bg-white dark:bg-gray-800 text-gray-700 dark:text-white">
                                              <Layers size={16}/> Merge Data
                                          </label>
                                      </div>
                                   </div>
                              </div>
                          </div>
                      )}
                      
                      {activeTab === 'updates' && (
                          <div className="space-y-6 animate-fade-in"> 
                              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                      <Zap size={150} className="transform rotate-12 text-brand-600"/>
                                  </div>
                                  
                                  <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-6 flex items-center gap-2 relative z-10">
                                      <div className="p-1.5 bg-brand-100 rounded-lg text-brand-600">
                                        <RefreshCw size={20} className={`${updateStatus === 'checking' || updateStatus === 'downloading' ? 'animate-spin' : ''}`}/> 
                                      </div>
                                      Software Update
                                  </h4>

                                  <div className="relative z-10 space-y-6">
                                      {/* Version Status Card */}
                                      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-600">
                                          <div className="mb-4 md:mb-0 text-center md:text-left">
                                              <p className="text-xs font-bold text-gray-400 uppercase mb-1 tracking-wider">Current Version</p>
                                              <p className="text-3xl font-black text-gray-800 dark:text-white">v2.1.0</p>
                                          </div>
                                          <div className="flex-1 w-full md:w-auto md:ml-8 text-center md:text-right">
                                              <p className={`text-sm font-bold flex items-center justify-center md:justify-end gap-2 ${
                                                  updateStatus === 'error' ? 'text-red-500' : 
                                                  updateStatus === 'ready' ? 'text-green-600' : 
                                                  updateStatus === 'downloading' ? 'text-blue-600' : 'text-gray-500'
                                              }`}>
                                                  {updateStatus === 'downloading' && <DownloadCloud size={16} className="animate-bounce"/>}
                                                  {updateMessage || 'System is up to date'}
                                              </p>
                                              {updateStatus === 'downloading' && (
                                                  <div className="w-full md:w-48 h-2 bg-gray-200 rounded-full mt-3 overflow-hidden ml-auto">
                                                      <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${Math.round(downloadProgress)}%` }}></div>
                                                  </div>
                                              )}
                                          </div>
                                      </div>

                                      {/* Check for Updates Button */}
                                      <div className="flex gap-4">
                                          {updateStatus === 'ready' ? (
                                              <button onClick={installUpdate} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-green-500/20 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                                  <FileDown size={18} /> Restart & Install Update
                                              </button>
                                          ) : (
                                              <button 
                                                onClick={checkForUpdates} 
                                                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                                                className="flex-1 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 text-white py-3.5 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                              >
                                                  {updateStatus === 'checking' ? <RefreshCw size={18} className="animate-spin"/> : <Search size={18}/>}
                                                  {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
                                              </button>
                                          )}
                                      </div>

                                      {/* Auto-Install Toggle */}
                                      <div className="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-4">
                                          <div className="mt-1 shrink-0 bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg text-blue-600"><AlertTriangle size={18}/></div>
                                          <div className="flex-1">
                                              <div className="flex justify-between items-center mb-2">
                                                  <span className="font-bold text-sm text-gray-800 dark:text-white">Auto-Install Updates</span>
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                      <input 
                                                          type="checkbox" 
                                                          className="sr-only peer" 
                                                          checked={state.settings.autoUpdateEnabled ?? true} 
                                                          onChange={() => updateState({...state, settings: {...state.settings, autoUpdateEnabled: !state.settings.autoUpdateEnabled}})} 
                                                      />
                                                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                                                  </label>
                                              </div>
                                              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                                  {(state.settings.autoUpdateEnabled ?? true) 
                                                    ? "Updates will be downloaded and installed automatically when you restart the app." 
                                                    : "Updates will download in the background, but you must manually click 'Install' here to apply them."
                                                  }
                                              </p>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

              </div>
          </div>
      </div>
    </div>
  );
};