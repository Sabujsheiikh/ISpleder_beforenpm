import React, { useEffect, useState, useRef } from 'react';
import { loadDB, saveDB } from './services/db';
import { GlobalState, ToastMessage, ToastType, ThemeColor } from './types';
import { LayoutDashboard, Users, Wallet, Settings, LogOut, Moon, Sun, Menu, X, Info, RefreshCw, Check, Activity, FileText, BarChart4, Search, Maximize, Minimize, ChevronRight, Cloud, CheckCircle, AlertCircle, Box, Shield, Sliders, Share2, Gauge } from './components/ui/Icons';
import { Dashboard } from './pages/Dashboard';
import { ClientMasterSheet } from './pages/ClientMasterSheet';
import { ExpenseManager } from './pages/ExpenseManager';
import { Settings as SettingsPage } from './pages/Settings';
import { ReportCenter } from './pages/ReportCenter';
import { Inventory } from './pages/Inventory';
import { Configuration } from './pages/Configuration';
import { NetworkTools } from './pages/NetworkTools';
import { NetworkDiagram } from './pages/NetworkDiagram';
import { About } from './pages/About';
import { ToastContainer } from './components/ui/Toast';
import { AUTH_KEY } from './constants';
import { sendToHost, onMessageFromHost, isWebView2 } from './services/bridge';

const App = () => {
  const [state, setState] = useState<GlobalState | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Toast State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // Refresh Animation State
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Global Search State
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const backupAttemptedRef = useRef(false);
  
  // Navigation State
  const [isNavExpanded, setIsNavExpanded] = useState(false); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  
  // Login Recovery State
  const [showForgotOptions, setShowForgotOptions] = useState(false);
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
   // Auth fallback URL from host (when browser open fails)
   const [lastAuthUrl, setLastAuthUrl] = useState<string | null>(null);

  // Theme Colors Mapping
  const themeColors: Record<ThemeColor, Record<number, string>> = {
    blue: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 900: '#1e3a8a' }, // Default
    purple: { 50: '#f3e8ff', 500: '#a855f7', 600: '#9333ea', 900: '#581c87' },
    emerald: { 50: '#ecfdf5', 500: '#10b981', 600: '#059669', 900: '#064e3b' },
    rose: { 50: '#fff1f2', 500: '#f43f5e', 600: '#e11d48', 900: '#881337' },
    orange: { 50: '#fff7ed', 500: '#f97316', 600: '#ea580c', 900: '#7c2d12' }
  };

  const applyTheme = (color: ThemeColor) => {
    const palettes: Record<ThemeColor, any> = {
      blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
      purple: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764' },
      emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
      rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
      orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407' }
    };

    const p = palettes[color];
    const root = document.documentElement;
    
    Object.keys(p).forEach(key => {
       root.style.setProperty(`--brand-${key}`, p[key]);
    });
  };

  useEffect(() => {
    const db = loadDB();
    setState(db);
    
    if (sessionStorage.getItem(AUTH_KEY) === 'true') {
      setIsAuthenticated(true);
    }

    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
       setDarkMode(true);
       document.documentElement.classList.add('dark');
    }

    if (db.settings.brandColor) {
       applyTheme(db.settings.brandColor);
    }

    const handleOnline = () => {
        setIsOnline(true);
        addToast('success', 'Back Online');
    }
    const handleOffline = () => {
        setIsOnline(false);
        addToast('warning', 'Offline Mode Active');
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // .NET WebView2 Listeners via Bridge
   onMessageFromHost((data) => {
      if (!data) return;
      // host bridge ready
      if (data.type === 'host_ready') {
         addToast('info', 'Desktop host bridge ready');
         return;
      }
     // Host started auth and provided URL (useful when browser open fails)
     if (data.type === 'google_auth_started') {
         if (data.url) {
             setLastAuthUrl(data.url);
             addToast('info', 'Host started auth — URL captured');
         }
         return;
     }
      // google auth flow from host
      if (data.type === 'google_auth_result') {
         if (data.success) {
            addToast('success', 'Google authenticated (host)');
           setLastAuthUrl(null);
         } else {
            // If host reports auth started but browser didn't open, provide fallback link
            if (data.message === 'auth_started' && data.url) {
               addToast('info', 'Host started auth — tap to copy URL');
               // create a temporary copyable toast message
               const id = Math.random().toString(36).substr(2,9);
               setToasts(prev => [...prev, { id, type: 'info', message: `Open this URL manually: ${data.url}` }]);
               // surface a persistent auth URL UI
               setLastAuthUrl(data.url);
            } else {
               addToast('error', 'Google auth failed (host)');
            }
         }
         return;
      }
      if (data.type === 'cmd_started') {
         addToast('info', 'Host started command');
         return;
      }
      if (data.action === 'request_state_for_backup') {
         // Host requests current state for scheduled backup
         if (state) sendToHost('backup_local', JSON.stringify(state));
         return;
      }
      if (data.type === 'backup_success') {
         addToast('success', 'Daily Local Backup Secured');
      }
        if (data.type === 'backup_failed') {
            addToast('error', 'Local Backup Failed: ' + data.message);
        }
        if (data.type === 'update_available') {
            addToast('info', 'New Version Available');
        }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Search Shortcut
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Dashboard Shortcut
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // TRIGGER AUTO-UPDATE CHECK based on Settings
   useEffect(() => {
      if (state && isWebView2() && state.settings.autoUpdateEnabled) {
         sendToHost('check_update');
      }
   }, [state?.settings.autoUpdateEnabled]);

  useEffect(() => {
     if(state?.settings.brandColor) {
        applyTheme(state.settings.brandColor);
     }
  }, [state?.settings.brandColor]);

  const addToast = (type: ToastType, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // BACKUP LOGIC (Revised for WebView2)
  useEffect(() => {
    if (state && isAuthenticated) {
       const today = new Date().toISOString().split('T')[0];
       
       if (state.settings.lastBackupDate !== today && !backupAttemptedRef.current) {
          backupAttemptedRef.current = true; 
          
          const newState = {
             ...state,
             settings: {
                ...state.settings,
                lastBackupDate: today
             }
          };
          setState(newState);
          saveDB(newState);

          // Local Disk Backup (WebView2 Bridge)
           if (isWebView2() && (state.settings.localBackupEnabled ?? true)) {
              setTimeout(() => {
                 sendToHost('backup_local', JSON.stringify(newState));
              }, 1000);
          } 
       }
    }
   }, [state, isAuthenticated]);

  const updateState = (newState: GlobalState) => {
    setState(newState);
    saveDB(newState);
      // Also request a local JSON backup on host when running inside WebView2
   if (isWebView2() && newState.settings.localBackupEnabled) {
            try {
                  sendToHost('backup_local', JSON.stringify(newState));
            } catch { }
      }
  };

  const handleSoftRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
        const freshState = loadDB();
        setState(freshState);
        setIsRefreshing(false);
        addToast('success', 'Data refreshed successfully');
    }, 600);
  };

  const handleGlobalSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setGlobalSearchTerm(val);
      if(val && activeTab !== 'clients') {
          setActiveTab('clients');
      }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state) return;
    
    if (btoa(authInput) === state.settings.passwordHash) {
      setIsAuthenticated(true);
      sessionStorage.setItem(AUTH_KEY, 'true'); 
      addToast('success', `Welcome back, ${state.settings.userName || 'Admin'}`);
    } else {
      addToast('error', 'Invalid Access Key');
    }
  };

  const handleRecoveryReset = (e: React.FormEvent) => {
      e.preventDefault();
      if (!state) return;

      const storedHash = state.settings.securityAnswerHash || btoa('admin');
      
      if (btoa(recoveryAnswer) === storedHash) {
          if (recoveryNewPassword.length < 4) {
              addToast('warning', 'New key must be at least 4 characters');
              return;
          }
          
          // Update Password and Login
          const newState = {
              ...state,
              settings: {
                  ...state.settings,
                  passwordHash: btoa(recoveryNewPassword)
              }
          };
          updateState(newState);
          setIsAuthenticated(true);
          sessionStorage.setItem(AUTH_KEY, 'true');
          addToast('success', 'Access Key reset successfully. Welcome back!');
          setShowForgotOptions(false);
          setRecoveryAnswer('');
          setRecoveryNewPassword('');
      } else {
          addToast('error', 'Incorrect Security Answer');
      }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthInput(''); // Clear the password input
    sessionStorage.removeItem(AUTH_KEY);
    addToast('info', 'Logged out successfully');
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleClientClick = (clientId: string) => {
    setGlobalSearchTerm(clientId);
    setActiveTab('clients');
  };

  if (!state) return <div className="flex h-screen items-center justify-center bg-gray-900 text-white font-bold animate-pulse">Initializing System...</div>;

  if (!isAuthenticated) {
   return (
     <div 
      // 1. Background Image container
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden font-sans selection:bg-brand-500 selection:text-white bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('https://i.imgur.com/680eUzy.png')" }}
     >
      {/* 2. Darkening Overlay (80% opacity) and Backdrop Blur */}
      <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-[2px]"></div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
        
      {/* Background Animated Orbs for visual effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-[-20%] left-[-20%] w-[70vw] h-[70vw] bg-brand-600/10 rounded-full blur-[100px] animate-spin-slow origin-center"></div>
         <div className="absolute bottom-[-20%] right-[-20%] w-[60vw] h-[60vw] bg-purple-600/10 rounded-full blur-[100px] animate-pulse"></div>
      </div>

      {/* Offline Mode Indicator (if needed) */}
      {!isOnline && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-yellow-400/10 backdrop-blur border border-yellow-400/20 text-yellow-400 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg z-50 animate-bounce-in">
            <RefreshCw size={12} className="animate-spin-slow"/> Offline Mode Active
        </div>
      )}
        
      {/* Login Card Container */}
      <div className="relative z-10 w-full max-w-[400px] mx-4">
          <div className="flex justify-center mb-8 animate-slide-up">
             <div className="w-20 h-20 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-brand-500/30 transform rotate-3 hover:rotate-6 transition-transform duration-500 border border-white/20">
                <Activity size={40} />
             </div>
          </div>

          {/* Login Card Body: Semi-transparent and blurred */}
          <div className="bg-white/10 dark:bg-gray-900/60 backdrop-blur-2xl border border-white/10 dark:border-gray-700/50 p-8 rounded-3xl shadow-2xl ring-1 ring-black/5 animate-scale-in">
             <div className="text-center mb-8">
                <h1 className="text-2xl font-black text-white tracking-tight mb-1">{state.settings.companyName}</h1>
                <p className="text-blue-200/60 text-xs font-bold uppercase tracking-[0.2em]">Managed with ISPLedger</p>
             </div>

             {!showForgotOptions ? (
                <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Access Key</label>
                     <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-200"></div>
                        <input 
                           type="password" 
                           value={authInput}
                           onChange={(e) => setAuthInput(e.target.value)}
                           autoComplete="new-password"
                           className="relative w-full px-5 py-3.5 bg-gray-950/80 border border-gray-800/50 rounded-xl focus:ring-0 text-white placeholder-gray-600 font-bold text-center tracking-[0.3em] outline-none transition-all shadow-inner"
                           placeholder="••••••••"
                           autoFocus
                        />
                     </div>
                  </div>

                  <div className="flex justify-end">
                     <button 
                        type="button" 
                        onClick={() => setShowForgotOptions(true)}
                        className="text-[10px] text-brand-400 hover:text-brand-300 font-bold transition-colors"
                     >
                        Forgot Access Key?
                     </button>
                  </div>

                  <button className="w-full bg-white text-gray-900 hover:bg-gray-100 py-3.5 rounded-xl font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 mt-4">
                     <span>Authenticate System</span>
                     <ChevronRight size={16} />
                  </button>
                </form>
             ) : (
                 <form onSubmit={handleRecoveryReset} className="space-y-4 animate-fade-in">
                   <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-2 flex items-center gap-1.5">
                          <Shield size={10} className="text-yellow-500"/> Security Question
                      </p>
                      <p className="text-sm font-semibold text-white mb-3">
                          {state.settings.securityQuestion || "What is your pet's name?"}
                      </p>
                             
                      <div className="space-y-3">
                          <input 
                             type="text" 
                             value={recoveryAnswer}
                             onChange={(e) => setRecoveryAnswer(e.target.value)}
                             className="w-full px-4 py-2.5 bg-gray-950/80 border border-gray-800/50 rounded-lg focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-600 text-sm outline-none transition-all"
                             placeholder="Your Answer"
                             autoFocus
                          />
                          <div className="pt-2 border-t border-gray-700 mt-2">
                             <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Set New Access Key</label>
                             <input 
                                type="password" 
                                value={recoveryNewPassword}
                                onChange={(e) => setRecoveryNewPassword(e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-950/80 border border-gray-800/50 rounded-lg focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-600 text-sm outline-none transition-all"
                                placeholder="New Password"
                             />
                          </div>
                      </div>
                   </div>

                   <div className="flex gap-3">
                      <button 
                         type="button" 
                         onClick={() => setShowForgotOptions(false)}
                         className="flex-1 bg-gray-800 text-gray-400 hover:bg-gray-700 py-3 rounded-xl font-bold text-xs transition-colors"
                      >
                         Cancel
                      </button>
                      <button 
                         type="submit" 
                         className="flex-[2] bg-brand-600 text-white hover:bg-brand-700 py-3 rounded-xl font-bold text-xs transition-colors shadow-lg shadow-brand-500/20"
                      >
                         Reset & Login
                      </button>
                   </div>
                 </form>
             )}

             <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-[10px] text-gray-400 font-medium flex items-center justify-center gap-2">
                    <Shield size={12} /> System Developed & Secured by
                </p>
                <p className="text-xs text-brand-500 font-bold mt-1">
                    Sabuj Sheikh
                </p>
             </div>
          </div>
      </div>
     </div>
   );
  }

  const NavItem = ({ id, label, icon: Icon, onClick }: any) => {
     const isActive = activeTab === id;
     return (
        <button
           onClick={onClick}
           className={`w-full flex items-center gap-3 py-3 rounded-xl mx-2 mb-1.5 transition-all duration-300 group relative overflow-hidden ${
              !isNavExpanded ? 'justify-center px-0 w-[44px] mx-auto' : 'px-4 w-auto mx-2'
           } ${
              isActive 
                ? 'bg-brand-50/80 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-semibold shadow-sm ring-1 ring-brand-200 dark:ring-brand-900/50' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 hover:text-gray-900 dark:hover:text-gray-200'
           }`}
        >
           <div className="relative z-10 flex items-center gap-3">
              <Icon size={isNavExpanded ? 18 : 20} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              {isNavExpanded && <span className="whitespace-nowrap text-sm">{label}</span>}
           </div>
           
           {!isNavExpanded && (
              <div className="absolute left-14 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap shadow-xl translate-x-2 group-hover:translate-x-0">
                 {label}
              </div>
           )}
        </button>
     );
  };
  
  const NavDivider = () => (
     <div className={`my-3 border-t dark:border-gray-800 opacity-50 ${isNavExpanded ? 'mx-4' : 'mx-3'}`}></div>
  );

  const hasBackedUpToday = state.settings.lastBackupDate === new Date().toISOString().split('T')[0];

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans overflow-hidden select-none">
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {!isOnline && (
        <div className="fixed bottom-12 right-4 z-[100] bg-gray-900/90 backdrop-blur text-white px-4 py-2.5 rounded-full shadow-2xl text-xs font-bold flex items-center gap-2 print:hidden border border-gray-700/50 animate-bounce-in">
           <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse"></div>
           Offline Mode
        </div>
      )}

      <header className="h-[60px] shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between px-4 z-40 transition-colors print:hidden">
          <div className="flex items-center gap-3 min-w-[200px]">
             <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-500/20 transform hover:rotate-3 transition-transform duration-300 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
                <Activity size={20} />
             </div>
             <span className="font-bold text-lg text-gray-800 dark:text-white truncate tracking-tight hidden sm:block">
                {state.settings.companyName}
             </span>
             <button 
                onClick={handleSoftRefresh} 
                className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all ml-1 active:rotate-180 duration-500"
                title="Refresh System"
             >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
             </button>
          </div>

          <div className="flex-1 max-w-md mx-auto relative hidden md:block group">
             <div className={`absolute inset-0 bg-brand-500/5 rounded-full blur-md transition-opacity duration-300 pointer-events-none ${globalSearchTerm ? 'opacity-100' : 'opacity-0'}`}></div>
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors pointer-events-none z-20" size={16} />
             <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Search clients, receipts (Ctrl+K)..."
                value={globalSearchTerm}
                onChange={handleGlobalSearch}
                className="relative z-10 w-full pl-10 pr-12 py-2 bg-gray-100/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-full text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white dark:focus:bg-gray-800 outline-none transition-all placeholder-gray-400 shadow-inner"
             />
          </div>

          <div className="flex items-center gap-4 min-w-[150px] justify-end">
             {/* If host couldn't open browser for Google auth, show the fallback URL copy button */}
             {lastAuthUrl && (
                <div className="hidden sm:flex items-center gap-2 mr-2">
                   <button
                      onClick={async () => {
                         try {
                             await navigator.clipboard.writeText(lastAuthUrl!);
                             addToast('success', 'Auth URL copied to clipboard');
                         } catch (e) {
                             // Fallback: open in new tab which may work in some packaging scenarios
                             try { window.open(lastAuthUrl, '_blank'); addToast('info', 'Opened auth URL in new tab'); } catch { addToast('error', 'Unable to copy or open URL'); }
                         }
                      }}
                      className="px-3 py-2 text-xs rounded-lg bg-yellow-50 text-yellow-800 border border-yellow-100 hover:bg-yellow-100 transition-colors"
                      title="Copy authentication URL"
                   >
                      Copy Auth URL
                   </button>
                   <button onClick={() => setLastAuthUrl(null)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
                </div>
             )}
             <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-gray-800 dark:text-white leading-none">{state.settings.userName || 'Admin'}</p>
                <p className="text-[10px] text-green-500 font-bold mt-0.5 flex items-center justify-end gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Online</p>
             </div>
             
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-600 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-brand-500/20 ring-2 ring-white dark:ring-gray-800 text-sm cursor-pointer hover:scale-105 transition-transform" onClick={() => setActiveTab('settings')}>
                 {(state.settings.userName || 'A').charAt(0)}
             </div>

             <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">
                <Menu size={22} />
             </button>
          </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
          
          <aside 
             className={`hidden lg:flex flex-col bg-white/80 dark:bg-gray-900/90 backdrop-blur-md border-r border-gray-200 dark:border-gray-800 z-30 transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${isNavExpanded ? 'w-64' : 'w-[72px]'} print:hidden`}
          >
             <div className={`flex items-center p-3 ${isNavExpanded ? 'justify-end' : 'justify-center'}`}>
                 <button 
                    onClick={() => setIsNavExpanded(!isNavExpanded)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                 >
                    {isNavExpanded ? <Minimize size={16} /> : <Maximize size={16} />}
                 </button>
             </div>

             <div className={`flex-1 py-2 ${isNavExpanded ? 'overflow-y-auto custom-scrollbar px-2' : 'overflow-hidden'}`}>
                 <NavItem id="dashboard" label="Dashboard" icon={LayoutDashboard} onClick={() => setActiveTab('dashboard')} />
                 <NavItem id="clients" label="Clients" icon={Users} onClick={() => { setActiveTab('clients'); setGlobalSearchTerm(''); }} />
                 <NavItem id="inventory" label="Inventory" icon={Box} onClick={() => setActiveTab('inventory')} />
                 <NavItem id="expenses" label="Expenses" icon={Wallet} onClick={() => setActiveTab('expenses')} />
                 <NavItem id="report_center" label="Reports" icon={BarChart4} onClick={() => setActiveTab('report_center')} />
                 <NavItem id="network_diagram" label="Network Diagram" icon={Share2} onClick={() => setActiveTab('network_diagram')} />
                 
                 <NavDivider />
                 
                 <NavItem id="configuration" label="Configuration" icon={Sliders} onClick={() => setActiveTab('configuration')} />
                 <NavItem id="network_tools" label="Network Tools" icon={Gauge} onClick={() => setActiveTab('network_tools')} />
                 <NavItem id="settings" label="Settings" icon={Settings} onClick={() => setActiveTab('settings')} />
                 
                 <NavDivider />

                 <NavItem id="about" label="About" icon={Info} onClick={() => setActiveTab('about')} />
             </div>

             <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 space-y-2">
                 <button onClick={toggleTheme} className={`w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-all shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-700 ${!isNavExpanded ? 'justify-center' : ''}`}>
                     {darkMode ? <Sun size={18} className="text-yellow-500"/> : <Moon size={18}/>}
                     {isNavExpanded && <span className="text-xs font-bold">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
                 </button>
                 <button onClick={handleLogout} className={`w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-600 transition-colors ${!isNavExpanded ? 'justify-center' : ''}`}>
                     <LogOut size={18}/>
                     {isNavExpanded && <span className="text-xs font-bold">Log Out</span>}
                 </button>
             </div>
          </aside>

          {isMobileMenuOpen && (
             <div className="fixed inset-0 z-50 lg:hidden print:hidden">
                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
                <aside className={`absolute inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slide-up`}>
                    <div className="h-[60px] border-b border-gray-200 dark:border-gray-800 flex justify-between items-center px-4 bg-gray-50 dark:bg-gray-800/50">
                        <h2 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><Menu size={18}/> Menu</h2>
                        <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"><X size={20}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-1">
                       <button onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><LayoutDashboard size={20}/> Dashboard</button>
                       <button onClick={() => { setActiveTab('clients'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'clients' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Users size={20}/> Clients</button>
                       <button onClick={() => { setActiveTab('inventory'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'inventory' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Box size={20}/> Inventory</button>
                       <button onClick={() => { setActiveTab('expenses'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'expenses' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Wallet size={20}/> Expenses</button>
                       <button onClick={() => { setActiveTab('report_center'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'report_center' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><BarChart4 size={20}/> Report Center</button>
                       <button onClick={() => { setActiveTab('network_diagram'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'network_diagram' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Share2 size={20}/> Network Diagram</button>
                       <div className="my-2 border-t dark:border-gray-700"></div>
                       <button onClick={() => { setActiveTab('configuration'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'configuration' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Sliders size={20}/> Configuration</button>
                       <button onClick={() => { setActiveTab('network_tools'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'network_tools' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Gauge size={20}/> Network Tools</button>
                       <button onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'settings' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Settings size={20}/> Settings</button>
                       <button onClick={() => { setActiveTab('about'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'about' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20' : 'text-gray-600 dark:text-gray-300'}`}><Info size={20}/> About</button>
                    </div>
                    <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3 bg-gray-50 dark:bg-gray-800/50">
                        <button onClick={toggleTheme} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600">
                           {darkMode ? <Sun size={18} className="text-yellow-500"/> : <Moon size={18}/>} <span className="text-sm font-medium">Switch Theme</span>
                        </button>
                        <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 text-red-600 border border-red-100 dark:border-transparent dark:bg-red-900/10">
                           <LogOut size={18}/> <span className="text-sm font-medium">Logout</span>
                        </button>
                    </div>
                </aside>
             </div>
          )}

          <main className="flex-1 flex flex-col overflow-hidden relative bg-gray-50 dark:bg-gray-950 transition-colors duration-200 print:overflow-visible print:bg-white print:h-auto">
             
             <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6 scroll-smooth custom-scrollbar print:overflow-visible print:p-0 print:h-auto" id="main-scroll-container">
                <div className={`max-w-[2000px] mx-auto w-full min-h-full transition-all duration-300 ${isRefreshing ? 'opacity-60 scale-[0.99] pointer-events-none' : 'opacity-100 scale-100'} print:opacity-100 print:scale-100`}>
                    
                    {activeTab === 'dashboard' && (
                      <div className="animate-slide-up">
                        <Dashboard 
                          state={state} 
                          onNavigate={(page) => setActiveTab(page)} 
                          onClientClick={handleClientClick}
                          addToast={addToast}
                        />
                      </div>
                    )}
                    {activeTab === 'report_center' && (
                      <div className="animate-slide-up">
                        <ReportCenter state={state} />
                      </div>
                    )}
                    {activeTab === 'clients' && (
                      <div className="animate-slide-up h-[calc(100vh-120px)] flex flex-col print:h-auto print:block">
                        <ClientMasterSheet 
                          state={state} 
                          updateState={updateState} 
                          highlightClientId={globalSearchTerm}
                          onClearSearch={() => setGlobalSearchTerm('')}
                          addToast={addToast}
                        />
                      </div>
                    )}
                    {activeTab === 'expenses' && (
                       <div className="animate-slide-up h-[calc(100vh-120px)] flex flex-col print:h-auto print:block">
                          <ExpenseManager state={state} updateState={updateState} />
                       </div>
                    )}
                    {activeTab === 'inventory' && (
                       <div className="animate-slide-up h-[calc(100vh-120px)] flex flex-col">
                          <Inventory state={state} updateState={updateState} addToast={addToast} />
                       </div>
                    )}
                    {activeTab === 'configuration' && (
                       <div className="animate-slide-up">
                          <Configuration state={state} updateState={updateState} addToast={addToast} />
                       </div>
                    )}
                    {activeTab === 'network_tools' && (
                       <div className="animate-slide-up h-full">
                          <NetworkTools state={state} />
                       </div>
                    )}
                    {activeTab === 'network_diagram' && (
                       <div className="animate-slide-up h-full">
                          <NetworkDiagram state={state} updateState={updateState} />
                       </div>
                    )}
                    {activeTab === 'settings' && (
                       <div className="animate-slide-up">
                          <SettingsPage state={state} updateState={updateState} addToast={addToast} />
                       </div>
                    )}
                    {activeTab === 'about' && (
                       <div className="animate-slide-up h-full">
                          <About state={state} />
                       </div>
                    )}
                </div>
             </div>
          </main>
      </div>
         {/* Persistent Auth URL Fallback (when host provides a manual auth link) */}
         {lastAuthUrl && (
            <div className="fixed bottom-24 right-4 z-[200] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl rounded-lg px-4 py-3 flex items-center gap-3 max-w-[420px]">
                <div className="text-xs text-gray-600 dark:text-gray-300 font-bold">Auth URL</div>
                <div className="flex-1 text-[12px] truncate text-gray-800 dark:text-gray-200" title={lastAuthUrl}>{lastAuthUrl}</div>
                <button className="px-2 py-1 bg-brand-600 text-white rounded text-xs font-bold" onClick={async () => { try { await navigator.clipboard.writeText(lastAuthUrl); addToast('success', 'Auth URL copied'); } catch { prompt('Copy this URL manually', lastAuthUrl); } }}>Copy</button>
                <a className="px-2 py-1 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-700 dark:text-gray-200 font-bold" href={lastAuthUrl} target="_blank" rel="noopener noreferrer">Open</a>
                <button onClick={() => setLastAuthUrl(null)} className="ml-2 text-gray-400 hover:text-gray-700">✕</button>
            </div>
         )}

         <footer className="h-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 text-[10px] text-gray-500 z-40 shrink-0 print:hidden">
         <div className="font-medium opacity-70 hover:opacity-100 transition-opacity">
            © 2025 ISPLedger – Secured by Sabuj Sheikh
         </div>
         <div className="flex items-center gap-4">
             <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-help" title="Daily Local Backup">
                 {hasBackedUpToday ? <CheckCircle size={12} className="text-green-500"/> : <AlertCircle size={12} className="text-gray-400"/>}
                 <span className={hasBackedUpToday ? 'text-green-600 font-bold' : ''}>Backup: {hasBackedUpToday ? 'Done' : 'Pending'}</span>
             </div>
             <div className="h-3 w-px bg-gray-300 dark:bg-gray-700"></div>
             <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-help" title="Google Drive Sync">
                 {state.settings.googleCloudConnected ? <Cloud size={12} className="text-blue-500"/> : <Cloud size={12} className="text-gray-400"/>}
                 <span className={state.settings.googleCloudConnected ? 'text-blue-600 font-bold' : ''}>Sync: {state.settings.googleCloudConnected ? 'Active' : 'Off'}</span>
             </div>
         </div>
      </footer>
    </div>
  );
};

export default App;