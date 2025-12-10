import React, { useState } from 'react';
import { GlobalState } from '../types';
import { Layers, FileText, Info, Mail, Activity, User, Facebook, Code, Shield, Zap, Server, Heart, Wifi, Users, Box, Share2, BarChart4, Database } from '../components/ui/Icons';

interface AboutProps {
  state: GlobalState;
}

export const About: React.FC<AboutProps> = ({ state }) => {
  // Update the initial activeTab and the order in the array: 'developer', 'features', 'version'
  const [activeTab, setActiveTab] = useState<'developer' | 'features' | 'version'>('developer');

  const features = [
    { title: 'Offline First', desc: 'Works completely without internet access. Data is stored securely on your local device.', icon: Database },
    { title: 'Client Management', desc: 'Comprehensive profiles, billing history, and connection details in one place.', icon: Users },
    { title: 'Automated Billing', desc: 'Auto-generates monthly bills with support for partial payments and dues tracking.', icon: FileText },
    { title: 'Inventory Tracking', desc: 'Manage Routers, ONUs, and cables. Track stock levels and asset assignments.', icon: Box },
    { title: 'Network Diagram', desc: 'Visual drag-and-drop topology builder to map your network infrastructure.', icon: Share2 },
    { title: 'Financial Analytics', desc: 'Real-time profit/loss statements, collection reports, and growth charts.', icon: BarChart4 },
    { title: 'Secure Backup', desc: 'Automated local backups and optional Google Drive cloud synchronization.', icon: Shield },
    { title: 'Network Tools', desc: 'Integrated speed tests, ping tools, and command references.', icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full animate-fade-in space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
           <h1 className="text-3xl font-black text-gray-800 dark:text-white flex items-center gap-3 tracking-tight">
             <div className="p-2 bg-brand-100 dark:bg-brand-900/30 rounded-xl text-brand-600">
                <Info size={28} />
             </div>
             About Application
           </h1>
           <p className="text-gray-500 font-medium mt-2 ml-1">
             System information, capabilities, and developer credits.
           </p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-900 p-1 rounded-xl flex items-center gap-1">
             {/* Developer Tab - Moved to the beginning */}
             <button
               onClick={() => setActiveTab('developer')}
               className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'developer' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
             >
                Developer
             </button>
             {/* Features Tab - Moved to the middle */}
             <button
               onClick={() => setActiveTab('features')}
               className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'features' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
             >
                Features
             </button>
             {/* Version Tab - Moved to the end */}
             <button
               onClick={() => setActiveTab('version')}
               className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'version' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
             >
                Version
             </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">

          {/* Developer Tab Content - Moved to the beginning */}
          {activeTab === 'developer' && (
              <div className="animate-slide-up max-w-3xl mx-auto">
                  <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">

                      {/* Banner */}
                      <div className="h-48 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 relative">
                           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                           <div className="absolute bottom-4 right-6 flex gap-3">
                                <a href="mailto:sabujsheiikh@gmail.com" className="bg-white/10 hover:bg-white/20 backdrop-blur text-white p-2 rounded-full transition-colors"><Mail size={18}/></a>
                                <a href="https://github.com/sobujsehk" className="bg-white/10 hover:bg-white/20 backdrop-blur text-white p-2 rounded-full transition-colors"><Code size={18}/></a>
                           </div>
                      </div>

                      {/* Content */}
                      <div className="px-8 pb-8 relative">
                           {/* Avatar */}
                           <div className="absolute -top-16 left-8">
                                <div className="w-32 h-32 rounded-3xl bg-white dark:bg-gray-800 p-1.5 shadow-xl rotate-3 hover:rotate-0 transition-transform duration-300">
                                     <img
                                          src="developer.png"
                                          onError={(e) => { e.currentTarget.src = 'https://i.imgur.com/3fcTzJO.png' }}
                                          alt="Sabuj Sheikh"
                                          className="w-full h-full object-cover rounded-2xl bg-gray-100 dark:bg-gray-900"
                                     />
                                </div>
                           </div>

                           <div className="pt-20">
                                <div className="flex justify-between items-start mb-6">
                                     <div>
                                          <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Sabuj Sheikh</h2>
                                          <p className="text-brand-600 font-bold">Developer of the Software</p>
                                     </div>
                                     <div className="hidden sm:block">
                                          <a
                                              href="https://www.facebook.com/sabujsheiikh"
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#166fe5] text-white px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-lg shadow-blue-500/20"
                                          >
                                              <Facebook size={16} /> Follow on Facebook
                                          </a>
                                     </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                     <div className="md:col-span-2">
                                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">About Me</h3>
                                          <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">
                                               I developed this application from the ground up, driven by pure curiosity and a strong passion for learning.
                                               Though I am not a professional programmer by trade, every line of code represents my journey to understand and build solutions in the digital world.
                                               <br/><br/>
                                               My goal is to create software that is not only functional but also intuitive and beautiful to use.
                                          </p>
                                     </div>
                                     <div className="space-y-4">
                                          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Contact</h3>
                                          <a href="mailto:sabujsheiikh@gmail.com" className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group">
                                               <div className="bg-white dark:bg-gray-800 p-2 rounded-lg text-gray-500 group-hover:text-brand-600 shadow-sm"><Mail size={16}/></div>
                                               <div className="overflow-hidden">
                                                    <p className="text-xs font-bold text-gray-400">Email</p>
                                                    <p className="text-xs font-bold text-gray-800 dark:text-white truncate">sabujsheiikh@gmail.com</p>
                                               </div>
                                          </a>
                                          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                                               <div className="bg-white dark:bg-gray-800 p-2 rounded-lg text-red-500 shadow-sm"><Heart size={16} fill="currentColor"/></div>
                                               <div>
                                                    <p className="text-xs font-bold text-gray-400">Made With</p>
                                                    <p className="text-xs font-bold text-gray-800 dark:text-white">Passion & Coffee</p>
                                               </div>
                                          </div>
                                     </div>
                                </div>

                                <div className="border-t border-gray-100 dark:border-gray-700 pt-6 flex justify-between items-center">
                                     <p className="text-xs text-gray-400 font-bold">© {new Date().getFullYear()} Sabuj Sheikh. All Rights Reserved.</p>
                                     <div className="sm:hidden">
                                          <a href="https://www.facebook.com/sabujsheiikh" className="text-blue-600"><Facebook size={20}/></a>
                                     </div>
                                </div>
                           </div>
                      </div>
                  </div>
              </div>
          )}


          {/* Features Tab Content - Moved to the middle */}
          {activeTab === 'features' && (
              <div className="animate-slide-up grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                   {features.map((feat, i) => (
                      <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                           <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 transition-colors">
                                <feat.icon size={24} className="text-gray-400 group-hover:text-brand-600 transition-colors" />
                           </div>
                           <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-2">{feat.title}</h3>
                           <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{feat.desc}</p>
                      </div>
                   ))}
              </div>
          )}


          {/* Version Tab Content - Moved to the end */}
          {activeTab === 'version' && (
              <div className="animate-slide-up max-w-4xl mx-auto space-y-6">
                   {/* Hero Version Card */}
                   <div className="bg-gradient-to-br from-brand-600 to-indigo-700 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-black opacity-10 rounded-full translate-y-1/3 -translate-x-1/3 blur-2xl"></div>

                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                            <div>
                                <div className="flex items-center gap-3 mb-2 opacity-80">
                                     <Layers size={20} />
                                     <span className="font-bold tracking-widest text-xs uppercase">Current Build</span>
                                </div>
                                <h2 className="text-5xl font-black mb-2">v2.1.0</h2>
                                <p className="text-lg font-medium opacity-90">Enterprise Release • Stable</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 min-w-[250px]">
                                <div className="space-y-3">
                                     <div className="flex justify-between items-center text-sm">
                                         <span className="opacity-70">Release Date</span>
                                         <span className="font-bold">June 12, 2025</span>
                                     </div>
                                     <div className="flex justify-between items-center text-sm">
                                         <span className="opacity-70">License</span>
                                         <span className="font-bold bg-white/20 px-2 py-0.5 rounded text-xs">Single User</span>
                                     </div>
                                     <div className="flex justify-between items-center text-sm">
                                         <span className="opacity-70">Build Type</span>
                                         <span className="font-bold">Production</span>
                                     </div>
                                </div>
                            </div>
                        </div>
                   </div>

                   {/* System Info */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                                <Server size={18} className="text-brand-600"/> Licensed Entity
                            </h3>
                            <div className="space-y-4">
                                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Company Name</p>
                                    <p className="font-bold text-gray-900 dark:text-white text-lg">{state.settings.companyName}</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Administrator</p>
                                    <p className="font-bold text-gray-900 dark:text-white">{state.settings.userName || 'Admin'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                                <Zap size={18} className="text-yellow-500"/> Tech Stack
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {['React 18', 'TypeScript', 'Tailwind CSS', 'Vite', 'Recharts', 'Electron', 'IndexedDB', 'Google Drive API'].map((tag, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-600">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                                This application is built with modern web technologies, packaged as a desktop application for maximum performance and offline capability.
                            </p>
                        </div>
                   </div>
              </div>
          )}
      </div>
    </div>
  );
};