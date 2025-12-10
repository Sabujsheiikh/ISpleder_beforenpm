
import React, { useState, useEffect } from 'react';
import { sendToHost, onMessageFromHost, isWebView2 } from '../services/bridge';
import { GlobalState, ToastType, BandwidthPackage, ThemeColor } from '../types';
import { User, Save, Box, Plus, Trash2, Sliders, Layout, Edit, Check, X, Columns, RefreshCw, AlertTriangle, Palette, CheckCircle } from '../components/ui/Icons';
import { Modal } from '../components/ui/Modal';
import { DEFAULT_HEADERS, DEFAULT_COLUMN_ORDER } from '../constants';

interface ConfigurationProps {
  state: GlobalState;
  updateState: (newState: GlobalState) => void;
  addToast: (type: ToastType, msg: string) => void;
  initialTab?: string;
}

export const Configuration: React.FC<ConfigurationProps> = ({ state, updateState, addToast, initialTab = 'company' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Company Profile State
  const [companyName, setCompanyName] = useState(state.settings.companyName);
  const [companyTagline, setCompanyTagline] = useState(state.settings.companyTagline || '');
  const [companyAddress, setCompanyAddress] = useState(state.settings.companyAddress || '');
  const [userName, setUserName] = useState(state.settings.userName || '');

  // Appearance State (Moved from Settings)
  const [maxDueDate, setMaxDueDate] = useState(state.settings.maxDueDate || 10);
  const [brandColor, setBrandColor] = useState<ThemeColor>(state.settings.brandColor || 'blue');

  // Package State
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Partial<BandwidthPackage>>({
      name: '', bandwidth: '', price: 0, remark: ''
  });

  // Table Config State
  const [headers, setHeaders] = useState(state.settings.customHeaders);
  const [columnOrder, setColumnOrder] = useState<string[]>(state.settings.columnOrder || DEFAULT_COLUMN_ORDER);
  const [newColumnName, setNewColumnName] = useState('');
    // Backups / Drive UI
    const [backupsList, setBackupsList] = useState<Array<any>>([]);
    const [driveStatus, setDriveStatus] = useState<string>('');
    const [scheduleChoice, setScheduleChoice] = useState<'none'|'D1'|'D3'|'D7'>('none');
    const [updateCleanupDays, setUpdateCleanupDays] = useState<number>(7);
    const [updateKeepLatest, setUpdateKeepLatest] = useState<number>(1);

  // Sync state when props change
  useEffect(() => {
    setHeaders(state.settings.customHeaders);
    setColumnOrder(state.settings.columnOrder || DEFAULT_COLUMN_ORDER);
    // Sync appearance settings if they change externally
    setBrandColor(state.settings.brandColor || 'blue');
    setMaxDueDate(state.settings.maxDueDate || 10);
        // ask host for current schedule when available
            if (isWebView2()) {
                sendToHost('get_backup_schedule');
                sendToHost('get_update_cleanup');
            }
  }, [state.settings]);

    useEffect(() => {
        const handler = (data: any) => {
            if (!data) return;
            if (data.type === 'drive_list_result') {
                setBackupsList(data.files || []);
                addToast('success', 'Drive backups listed');
                return;
            }
            if (data.type === 'drive_download_result') {
                if (data.success) {
                    addToast('success', 'Backup restored from Drive — reloading app');
                } else {
                    addToast('error', 'Backup restore failed');
                }
                return;
            }
            if (data.type === 'drive_delete_result') {
                if (data.success) {
                    addToast('success', 'Backup deleted');
                    // refresh list
                    sendToHost('drive_list');
                } else {
                    addToast('error', 'Delete failed');
                }
                return;
            }
            if (data.type === 'google_auth_result') {
                setDriveStatus(data.success ? 'Authenticated' : 'Auth failed');
                addToast(data.success ? 'success' : 'error', data.message || (data.success ? 'Google authenticated' : 'Google auth failed'));
                return;
            }
            if (data.type === 'get_backup_schedule_result') {
                try {
                      const days = data.days as number;
                      const auto = data.autoUpload as boolean;
                    if (!auto) setScheduleChoice('none');
                    else if (days === 1) setScheduleChoice('D1');
                    else if (days === 3) setScheduleChoice('D3');
                    else if (days === 7) setScheduleChoice('D7');
                } catch (e) {
                    // ignore
                }
                return;
            }
            if (data.type === 'get_update_cleanup_result') {
                try {
                    setUpdateCleanupDays(Number(data.days || 7));
                    setUpdateKeepLatest(Number(data.keepLatest || 1));
                } catch { }
                return;
            }
            if (data.type === 'set_update_cleanup_result') {
                if (data.success) {
                    addToast('success', 'Update cleanup saved');
                } else {
                    addToast('error', 'Failed to save update cleanup settings');
                }
                return;
            }
        };
        onMessageFromHost(handler);
    }, []);

  const handleSaveCompany = () => {
    updateState({
      ...state,
      settings: {
        ...state.settings,
        companyName,
        companyTagline,
        companyAddress,
        userName
      }
    });
    addToast('success', 'Company profile updated');
  };

  const handleSaveAppearance = () => {
    updateState({
      ...state,
      settings: {
        ...state.settings,
        brandColor,
        maxDueDate: Number(maxDueDate)
      }
    });
    addToast('success', 'Appearance settings saved');
  };

  const handleSavePackage = () => {
    if (!editingPackage.name || !editingPackage.bandwidth) {
        addToast('error', 'Package name and bandwidth required');
        return;
    }

    const currentPackages = state.settings.bandwidthPackages || [];
    let updatedPackages;

    if (editingPackage.id) {
        // Edit Mode
        updatedPackages = currentPackages.map(p => p.id === editingPackage.id ? { ...p, ...editingPackage } as BandwidthPackage : p);
        addToast('success', 'Package updated');
    } else {
        // Add Mode
        const newPkg: BandwidthPackage = {
            id: crypto.randomUUID(),
            name: editingPackage.name,
            bandwidth: editingPackage.bandwidth,
            price: Number(editingPackage.price) || 0,
            remark: editingPackage.remark || ''
        };
        updatedPackages = [...currentPackages, newPkg];
        addToast('success', 'Package created');
    }

    updateState({
        ...state,
        settings: {
            ...state.settings,
            bandwidthPackages: updatedPackages
        }
    });
    setIsPackageModalOpen(false);
  };

  const handleDeletePackage = (id: string) => {
      if(!confirm("Delete this package?")) return;
      const currentPackages = state.settings.bandwidthPackages || [];
      updateState({
          ...state,
          settings: {
              ...state.settings,
              bandwidthPackages: currentPackages.filter(p => p.id !== id)
          }
      });
      addToast('info', 'Package deleted');
  };

  const openEditPackage = (pkg: BandwidthPackage) => {
      setEditingPackage(pkg);
      setIsPackageModalOpen(true);
  };

  const openAddPackage = () => {
      setEditingPackage({ name: '', bandwidth: '', price: 0, remark: '' });
      setIsPackageModalOpen(true);
  };

  // --- Table Logic ---
  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...columnOrder];
    if (direction === 'up') {
      if (index === 0) return;
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else {
      if (index === newOrder.length - 1) return;
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setColumnOrder(newOrder);
    
    updateState({
        ...state,
        settings: { ...state.settings, columnOrder: newOrder }
    });
  };

  const handleAddColumn = () => {
     if (!newColumnName) return;
     const key = newColumnName.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 5);
     const newHeaders = { ...headers, [key]: newColumnName };
     const newOrder = [...columnOrder];
     newOrder.splice(newOrder.length - 1, 0, key);
     const newDynamic = [...(state.settings.dynamicFields || []), key];
     setHeaders(newHeaders);
     setColumnOrder(newOrder);
     setNewColumnName('');
     updateState({
        ...state,
        settings: { ...state.settings, customHeaders: newHeaders, columnOrder: newOrder, dynamicFields: newDynamic }
     });
     addToast('success', 'Column added');
  };

  const handleDeleteColumn = (key: string) => {
     if (['actions', 'clientName', 'payable', 'paid'].includes(key)) {
         addToast('error', "System columns cannot be deleted.");
         return;
     }
     if (confirm(`Delete column "${headers[key] || key}"?`)) {
        const newOrder = columnOrder.filter(k => k !== key);
        const newDynamic = (state.settings.dynamicFields || []).filter(k => k !== key);
        setColumnOrder(newOrder);
        updateState({
           ...state,
           settings: { ...state.settings, columnOrder: newOrder, dynamicFields: newDynamic }
        });
        addToast('success', 'Column deleted');
     }
  };

  const handleHeaderNameChange = (key: string, val: string) => {
      const newHeaders = { ...headers, [key]: val };
      setHeaders(newHeaders);
      updateState({
          ...state,
          settings: { ...state.settings, customHeaders: newHeaders }
      });
  };

  return (
    <div className="flex flex-col h-full animate-fade-in space-y-4 pb-20">
      <div className="flex justify-between items-center mb-2">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
             <Sliders size={24} className="text-brand-600"/> Configuration
           </h1>
           <p className="text-sm text-gray-500">Manage business details, appearance, service packages, and table layouts.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
          
          {/* Sidebar Tabs */}
          <div className="w-full md:w-64 flex flex-col gap-2 shrink-0">
                            <button 
                                onClick={() => setActiveTab('backups')}
                                className={`text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-3 transition-colors ${activeTab === 'backups' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm border border-brand-100 dark:border-brand-900 ring-1 ring-brand-50 dark:ring-brand-900' : 'text-gray-500 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'}`}
                            >
                                    <Layout size={18} /> Backups
                            </button>
              <button 
                onClick={() => setActiveTab('company')}
                className={`text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-3 transition-colors ${activeTab === 'company' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm border border-brand-100 dark:border-brand-900 ring-1 ring-brand-50 dark:ring-brand-900' : 'text-gray-500 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                  <User size={18} /> Company Profile
              </button>
              <button 
                onClick={() => setActiveTab('appearance')}
                className={`text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-3 transition-colors ${activeTab === 'appearance' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm border border-brand-100 dark:border-brand-900 ring-1 ring-brand-50 dark:ring-brand-900' : 'text-gray-500 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                  <Palette size={18} /> Appearance
              </button>
              <button 
                onClick={() => setActiveTab('packages')}
                className={`text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-3 transition-colors ${activeTab === 'packages' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm border border-brand-100 dark:border-brand-900 ring-1 ring-brand-50 dark:ring-brand-900' : 'text-gray-500 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                  <Box size={18} /> Packages
              </button>
              <button 
                onClick={() => setActiveTab('table')}
                className={`text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-3 transition-colors ${activeTab === 'table' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm border border-brand-100 dark:border-brand-900 ring-1 ring-brand-50 dark:ring-brand-900' : 'text-gray-500 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                  <Columns size={18} /> Table Columns
              </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
              <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                  
                  {activeTab === 'company' && (
                      <div className="animate-fade-in space-y-6 max-w-lg">
                          <h2 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2 mb-6">
                              Business Information
                          </h2>
                          
                          <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Company Name</label>
                                <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none transition-shadow" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. SpeedNet ISP" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tagline / Slogan</label>
                                <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none" value={companyTagline} onChange={e => setCompanyTagline(e.target.value)} placeholder="e.g. Fast & Reliable" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Administrator Name</label>
                                <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none" value={userName} onChange={e => setUserName(e.target.value)} placeholder="Name used on reports" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Office Address</label>
                                <textarea className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none" rows={3} value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="Full Address" />
                            </div>

                            <div className="pt-4">
                                <button onClick={handleSaveCompany} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl hover:bg-brand-700 flex items-center gap-2 shadow-lg shadow-brand-500/20 font-bold transition-transform active:scale-95">
                                    <Save size={18} /> Save Profile
                                </button>
                            </div>
                          </div>
                      </div>
                  )}

                  {activeTab === 'appearance' && (
                      <div className="animate-fade-in space-y-6">
                          <h2 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2 mb-6">
                              Look & Feel
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-3 block">Interface Accent Color</label>
                                <div className="flex gap-4">
                                    {['blue', 'purple', 'emerald', 'rose', 'orange'].map((c) => (
                                        <button
                                        key={c}
                                        onClick={() => setBrandColor(c as ThemeColor)}
                                        className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center shadow-sm ${brandColor === c ? 'ring-4 ring-gray-200 dark:ring-gray-600 scale-110' : 'hover:scale-105 opacity-80'}`}
                                        style={{ backgroundColor: c === 'blue' ? '#3b82f6' : c === 'purple' ? '#a855f7' : c === 'emerald' ? '#10b981' : c === 'rose' ? '#f43f5e' : '#f97316' }}
                                        >
                                            {brandColor === c && <CheckCircle className="text-white drop-shadow-md" size={18} />}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2">Pick a primary color for buttons, active tabs, and highlights.</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Payment Due Date Threshold</label>
                                <div className="relative max-w-xs">
                                    <input type="number" min="1" max="31" className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-brand-500 outline-none font-bold" value={maxDueDate} onChange={e => setMaxDueDate(Number(e.target.value))} />
                                    <span className="absolute right-3 top-2.5 text-xs text-gray-400 font-bold">th of Month</span>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Used to calculate on-time payment metrics on dashboard.</p>
                            </div>
                          </div>
                          
                          <div className="pt-4">
                                <button onClick={handleSaveAppearance} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl hover:bg-brand-700 flex items-center gap-2 shadow-lg shadow-brand-500/20 font-bold transition-transform active:scale-95">
                                    <Save size={18} /> Save Appearance
                                </button>
                          </div>
                      </div>
                  )}

                  {activeTab === 'packages' && (
                      <div className="animate-fade-in space-y-6">
                          <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2 mb-6">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                                Bandwidth Packages
                            </h2>
                            <button onClick={openAddPackage} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-brand-700 transition-colors flex items-center gap-2 text-xs shadow-sm">
                                <Plus size={16} /> Add Package
                            </button>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 uppercase font-bold text-[10px]">
                                      <tr>
                                          <th className="px-4 py-3">Package Name</th>
                                          <th className="px-4 py-3">Bandwidth</th>
                                          <th className="px-4 py-3 text-right">Price</th>
                                          <th className="px-4 py-3">Remark</th>
                                          <th className="px-4 py-3 text-right">Actions</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                      {(state.settings.bandwidthPackages || []).map((pkg) => (
                                          <tr key={pkg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                              <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{pkg.name}</td>
                                              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{pkg.bandwidth}</td>
                                              <td className="px-4 py-3 text-right font-bold text-brand-600">{state.settings.currencySymbol}{pkg.price}</td>
                                              <td className="px-4 py-3 text-gray-500 italic text-xs">{pkg.remark || '-'}</td>
                                              <td className="px-4 py-3 text-right">
                                                  <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => openEditPackage(pkg)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"><Edit size={14}/></button>
                                                    <button onClick={() => handleDeletePackage(pkg.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 size={14}/></button>
                                                  </div>
                                              </td>
                                          </tr>
                                      ))}
                                      {(state.settings.bandwidthPackages || []).length === 0 && (
                                          <tr>
                                              <td colSpan={5} className="text-center p-8 text-gray-400 italic">No packages defined. Add one to get started.</td>
                                          </tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}

                  {activeTab === 'table' && (
                      <div className="space-y-6 animate-fade-in">
                          <div className="flex justify-between items-center border-b pb-2 dark:border-gray-700">
                             <div>
                                 <h3 className="text-lg font-bold text-gray-800 dark:text-white">Table Column Configuration</h3>
                                 <p className="text-xs text-gray-500">Customize the Client Master Sheet columns.</p>
                             </div>
                             <button onClick={() => { setHeaders(DEFAULT_HEADERS); setColumnOrder(DEFAULT_COLUMN_ORDER); addToast('info', 'Defaults restored'); }} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg">
                                <RefreshCw size={12}/> Reset Defaults
                             </button>
                          </div>

                          <div className="flex gap-2">
                                <input className="flex-1 border p-2.5 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 dark:text-white border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-brand-500" placeholder="New Column Name" value={newColumnName} onChange={e => setNewColumnName(e.target.value)} />
                                <button onClick={handleAddColumn} className="bg-gray-800 text-white px-4 rounded-lg text-sm font-bold hover:bg-gray-900 transition-colors flex items-center gap-2"><Plus size={16}/> Add Column</button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {columnOrder.map((key, index) => {
                                    if (key === 'actions') return null;
                                    return (
                                        <div key={key} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border border-gray-200 dark:border-gray-600 group hover:border-brand-300 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <button onClick={() => moveColumn(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-brand-600 disabled:opacity-20 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-current"></div></button>
                                                <button onClick={() => moveColumn(index, 'down')} disabled={index === columnOrder.length - 2} className="text-gray-400 hover:text-brand-600 disabled:opacity-20 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-current"></div></button>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <input 
                                                    className="w-full bg-transparent text-sm font-bold text-gray-700 dark:text-gray-200 outline-none border-none p-0 focus:ring-0"
                                                    value={headers[key] || key}
                                                    onChange={(e) => handleHeaderNameChange(key, e.target.value)}
                                                />
                                                <p className="text-[9px] text-gray-400 uppercase font-mono truncate" title={key}>{key}</p>
                                            </div>
                                            <button onClick={() => handleDeleteColumn(key)} className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )
                                })}
                           </div>
                           <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-xl border border-yellow-100 dark:border-yellow-900/30">
                               <p className="text-xs text-yellow-700 dark:text-yellow-500 font-medium flex items-center gap-2"><AlertTriangle size={14}/> Changes are auto-saved to ensure consistency.</p>
                           </div>
                      </div>
                  )}

                                    {activeTab === 'backups' && (
                                        <div className="animate-fade-in space-y-6 max-w-2xl">
                                            <h2 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">Backups & Sync</h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <p className="text-sm text-gray-600">Google Drive backups are stored in your Drive App Data folder. Use the buttons below to sign in, upload now, or list available backups.</p>
                                                    <div className="flex gap-2 mt-3">
                                                        <button onClick={() => sendToHost('google_auth')} className="px-3 py-2 bg-blue-600 text-white rounded">Sign In</button>
                                                        <button onClick={() => sendToHost('drive_upload')} className="px-3 py-2 bg-green-600 text-white rounded">Upload Now</button>
                                                        <button onClick={() => sendToHost('drive_list')} className="px-3 py-2 bg-gray-200 text-gray-800 rounded">List Backups</button>
                                                    </div>
                                                    <p className="text-xs text-gray-400">Status: {driveStatus || 'Not authenticated'}</p>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Auto-upload Schedule</label>
                                                    <select value={scheduleChoice} onChange={e => setScheduleChoice(e.target.value as any)} className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700">
                                                        <option value="none">Disabled</option>
                                                        <option value="D1">Daily (D1)</option>
                                                        <option value="D3">Every 3 days (D3)</option>
                                                        <option value="D7">Weekly (D7)</option>
                                                    </select>
                                                    <div className="flex gap-2 mt-3">
                                                        <button onClick={() => {
                                                                // map choice -> host expects { days, autoUpload }
                                                                if (scheduleChoice === 'none') sendToHost('set_backup_schedule', { days: 1, autoUpload: false });
                                                                else if (scheduleChoice === 'D1') sendToHost('set_backup_schedule', { days: 1, autoUpload: true });
                                                                else if (scheduleChoice === 'D3') sendToHost('set_backup_schedule', { days: 3, autoUpload: true });
                                                                else if (scheduleChoice === 'D7') sendToHost('set_backup_schedule', { days: 7, autoUpload: true });
                                                                addToast('success', 'Backup schedule saved');
                                                            }} className="px-3 py-2 bg-brand-600 text-white rounded">Save Schedule</button>
                                                        <button onClick={() => sendToHost('get_backup_schedule')} className="px-3 py-2 bg-gray-200 rounded">Refresh</button>
                                                    </div>
                                                    <div className="mt-4 border-t pt-4">
                                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Installer Temp Cleanup</label>
                                                        <div className="grid grid-cols-2 gap-2 items-end">
                                                            <div>
                                                                <label className="text-[10px] text-gray-500">Retention (days)</label>
                                                                <input type="number" min={0} value={updateCleanupDays} onChange={e => setUpdateCleanupDays(Number(e.target.value))} className="w-full p-2 border rounded" />
                                                                <p className="text-xs text-gray-400">Files older than this will be deleted. Set 0 to delete all except kept latest.</p>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500">Keep latest</label>
                                                                <input type="number" min={0} value={updateKeepLatest} onChange={e => setUpdateKeepLatest(Number(e.target.value))} className="w-full p-2 border rounded" />
                                                                <p className="text-xs text-gray-400">Number of newest installer files to always keep.</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2 mt-3">
                                                            <button onClick={() => { sendToHost('set_update_cleanup', { days: updateCleanupDays, keepLatest: updateKeepLatest }); }} className="px-3 py-2 bg-brand-600 text-white rounded">Save Cleanup</button>
                                                            <button onClick={() => sendToHost('get_update_cleanup')} className="px-3 py-2 bg-gray-200 rounded">Refresh</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                <h3 className="text-sm font-bold mb-2">Available Backups</h3>
                                                <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3 bg-gray-50 dark:bg-gray-800">
                                                    {backupsList.length === 0 && <div className="text-xs text-gray-400">No backups listed. Click 'List Backups' to refresh.</div>}
                                                    {backupsList.map((f: any) => (
                                                        <div key={f.id} className="flex items-center justify-between bg-white dark:bg-gray-900 p-2 rounded">
                                                            <div className="text-sm">
                                                                <div className="font-bold">{f.name}</div>
                                                                <div className="text-xs text-gray-500">{f.modified}</div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => sendToHost('drive_download', { id: f.id })} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Restore</button>
                                                                <button onClick={() => sendToHost('drive_delete', { id: f.id })} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

              </div>
          </div>
      </div>

      <Modal isOpen={isPackageModalOpen} onClose={() => setIsPackageModalOpen(false)} title={editingPackage.id ? "Edit Package" : "Create New Package"}>
           <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Package Name</label>
                    <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} placeholder="e.g. Gold Plan" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Bandwidth</label>
                        <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" value={editingPackage.bandwidth} onChange={e => setEditingPackage({...editingPackage, bandwidth: e.target.value})} placeholder="e.g. 20 Mbps" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Price</label>
                        <input type="number" className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" value={editingPackage.price || ''} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} placeholder="0.00" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Remark (Optional)</label>
                    <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" value={editingPackage.remark || ''} onChange={e => setEditingPackage({...editingPackage, remark: e.target.value})} placeholder="e.g. Best for streaming" />
                </div>
                
                <button onClick={handleSavePackage} className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 font-bold shadow-lg mt-2 transition-transform active:scale-[0.98]">
                    {editingPackage.id ? 'Update Package' : 'Create Package'}
                </button>
           </div>
      </Modal>
    </div>
  );
};
