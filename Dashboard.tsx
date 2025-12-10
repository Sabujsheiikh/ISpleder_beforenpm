import React, { useMemo, useState } from 'react';
import { GlobalState, ExpenseType, ToastType } from '../types';
import { Users, Wallet, AlertCircle, DollarSign, TrendingDown, TrendingUp, Activity, Box, MoreVertical, Award } from '../components/ui/Icons';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Cell, PieChart, Pie, Legend, ComposedChart, Line } from 'recharts';
import { Modal } from '../components/ui/Modal';

interface DashboardProps {
  state: GlobalState;
  onNavigate: (page: string) => void;
  onClientClick?: (clientId: string) => void;
  addToast?: (type: ToastType, msg: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ state, onNavigate, onClientClick, addToast }) => {
  const { clients, records, expenses, currentViewMonth, settings } = state;

  // 1. Calculate Current Month Metrics
  const metrics = useMemo(() => {
    const currentRecords = records.filter(r => r.monthKey === currentViewMonth);
    
    // Client Metrics
    const totalClients = clients.filter(c => !c.isArchived).length;
    const activeClients = clients.filter(c => c.isActive && !c.isArchived).length;
    
    const totalPayable = currentRecords.reduce((sum, r) => sum + r.payableAmount, 0);
    const totalPaid = currentRecords.reduce((sum, r) => sum + r.paidAmount, 0);
    const totalUnpaid = totalPayable - totalPaid;
    
    const collectionRate = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
    
    // Total Real Expense (Debit)
    const currentMonthExpenses = expenses.filter(e => e.date.startsWith(currentViewMonth) && e.type === ExpenseType.DEBIT);
    const totalExpense = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    const finalBalance = totalPaid - totalExpense;

    return { 
        totalClients, 
        activeClients, 
        totalPayable, 
        totalPaid, 
        totalUnpaid, 
        totalExpense, 
        finalBalance, 
        collectionRate
    };
  }, [clients, records, expenses, currentViewMonth]);

  // 2. Client Growth Data (Active vs New vs Left)
  const clientGrowthData = useMemo(() => {
     const data = [];
     const year = new Date().getFullYear();
     for(let i=1; i<=12; i++) {
        const monthKey = `${year}-${String(i).padStart(2, '0')}`;
        
        // Count Active Clients from snapshot records
        const activeCount = records.filter(r => r.monthKey === monthKey && r.isActive).length;
        
        // Count New Joins based on joiningDate
        const newJoins = clients.filter(c => c.joiningDate && c.joiningDate.startsWith(monthKey)).length;

        // Count Left Clients based on leftDate
        const leftCount = clients.filter(c => c.isArchived && c.leftDate && c.leftDate.startsWith(monthKey)).length;

        data.push({
            month: new Date(year, i-1).toLocaleString('default', { month: 'short' }),
            Active: activeCount,
            New: newJoins,
            Left: leftCount // Churn
        });
     }
     return data;
  }, [records, clients]);

  const leftClientsList = useMemo(() => {
      return clients.filter(c => c.isArchived).sort((a,b) => {
          return new Date(b.leftDate || '').getTime() - new Date(a.leftDate || '').getTime();
      });
  }, [clients]);

  // 3. Top Clients Logic (Paid On Time)
  const topClients = useMemo(() => {
      const clientStats = clients.filter(c => !c.isArchived).map(client => {
          // Get all paid records for this client
          const clientRecords = records.filter(r => r.clientId === client.id && r.paidAmount > 0);
          
          let onTimeCount = 0;
          let totalPaid = 0;
          let lastPaymentDate = '';

          clientRecords.forEach(r => {
              totalPaid += r.paidAmount;
              if (r.paymentDate) {
                  const day = parseInt(r.paymentDate.split('-')[2]);
                  const dueDate = settings.maxDueDate || 10;
                  if (day <= dueDate) onTimeCount++;
                  
                  if (!lastPaymentDate || new Date(r.paymentDate) > new Date(lastPaymentDate)) {
                      lastPaymentDate = r.paymentDate;
                  }
              }
          });

          const rate = clientRecords.length > 0 ? (onTimeCount / clientRecords.length) * 100 : 0;

          return {
              id: client.id,
              name: client.name,
              username: client.username,
              totalPaid,
              lastPayment: lastPaymentDate,
              onTimeRate: Math.round(rate)
          };
      });

      // Sort by On-Time Rate (Desc) then Total Paid (Desc)
      return clientStats
          .filter(c => c.totalPaid > 0)
          .sort((a, b) => b.onTimeRate - a.onTimeRate || b.totalPaid - a.totalPaid)
          .slice(0, 5);
  }, [clients, records, settings.maxDueDate]);

  // 4. Financial Overview Data
  const overviewData = useMemo(() => {
     return [
        { name: 'Payable', amount: metrics.totalPayable, color: '#60a5fa' },   // Blue
        { name: 'Collection', amount: metrics.totalPaid, color: '#34d399' }, // Emerald
        { name: 'Expense', amount: metrics.totalExpense, color: '#f87171' },   // Red
        { name: 'Balance', amount: metrics.finalBalance, color: '#a78bfa' }    // Purple
     ];
  }, [metrics]);

  const pieData = useMemo(() => {
    return [
      { name: 'Collection', value: metrics.totalPaid, color: '#34d399' },
      { name: 'Due Amount', value: metrics.totalUnpaid, color: '#f87171' },
      { name: 'Expense', value: metrics.totalExpense, color: '#fbbf24' }
    ].filter(item => item.value > 0);
  }, [metrics]);

  // Updated Overdue Logic
  const overdueClients = useMemo(() => {
    return records
      .filter(r => r.monthKey === currentViewMonth && r.overdueMonths >= 1 && (r.payableAmount - r.paidAmount) > 0)
      .map(r => {
         const calculatedDue = r.payableAmount - r.paidAmount; // Total current due
         return { ...r, due: calculatedDue };
      });
  }, [records, currentViewMonth]);

  // Helper Component for Cards
  const ModernStatCard = ({ title, value, subtext, icon: Icon, gradientClass, onClick, delay }: any) => (
    <div 
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl cursor-pointer transition-all duration-300 transform hover:-translate-y-1 ${gradientClass} text-white p-6 border border-white/10 group h-32 flex flex-col justify-between`}
      style={{ animationDelay: `${delay}ms`, animationName: 'slideUp', animationFillMode: 'both', animationDuration: '0.5s' }}
    >
       {/* Background Decoration */}
       <div className="absolute -right-6 -top-6 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-500 transform scale-150 rotate-12">
          <Icon size={120} />
       </div>
       
       <div className="flex justify-between items-start relative z-10">
           <div>
               <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
               <h3 className="text-2xl font-black tracking-tight">{value}</h3>
           </div>
           <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm group-hover:scale-110 transition-transform">
                <Icon size={20} className="text-white" />
           </div>
       </div>
       
       <div className="relative z-10">
          {subtext && <p className="text-xs opacity-80 font-medium flex items-center gap-1">{subtext}</p>}
       </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      
      {/* Header Section */}
      <div className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-white/50 dark:border-gray-700 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 animate-scale-in">
         <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight flex items-center gap-2">
                 Welcome Back <span className="text-brand-600 animate-pulse">👋</span>
            </h1>
            <p className="text-sm text-gray-500 font-medium flex items-center gap-2 mt-1">
               Overview for <span className="font-bold text-gray-700 dark:text-gray-300">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </p>
         </div>
         <div className="flex gap-2">
            <button onClick={() => onNavigate('inventory')} className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-brand-600 dark:text-white border border-gray-200 dark:border-gray-600 px-5 py-2 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center gap-2">
               <Box size={16} /> Inventory
            </button>
            <button onClick={() => onNavigate('clients')} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-105 active:scale-95">
               Manage Clients
            </button>
         </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
         <ModernStatCard 
            title="Total Collection"
            value={`${state.settings.currencySymbol} ${metrics.totalPaid.toLocaleString()}`}
            subtext={`Target: ${state.settings.currencySymbol} ${metrics.totalPayable.toLocaleString()}`}
            icon={DollarSign}
            gradientClass="bg-gradient-to-br from-brand-500 to-indigo-600"
            onClick={() => onNavigate('clients')}
            delay={0}
         />
         <ModernStatCard 
            title="Total Due (Mkt)"
            value={`${state.settings.currencySymbol} ${metrics.totalUnpaid.toLocaleString()}`}
            subtext={`${overdueClients.length} Clients Overdue`}
            icon={AlertCircle}
            gradientClass="bg-gradient-to-br from-rose-500 to-pink-600"
            onClick={() => { onNavigate('clients'); }} 
            delay={100}
         />
         <ModernStatCard 
            title="Total Expense"
            value={`${state.settings.currencySymbol} ${metrics.totalExpense.toLocaleString()}`}
            subtext="This Month"
            icon={TrendingDown}
            gradientClass="bg-gradient-to-br from-orange-500 to-red-600"
            onClick={() => onNavigate('expenses')}
            delay={200}
         />
         <ModernStatCard 
            title="Net Balance"
            value={`${state.settings.currencySymbol} ${metrics.finalBalance.toLocaleString()}`}
            subtext="After Expenses"
            icon={Wallet}
            gradientClass="bg-gradient-to-br from-emerald-500 to-teal-600"
            onClick={() => onNavigate('expenses')}
            delay={300}
         />
         <ModernStatCard 
            title="Total Clients"
            value={metrics.totalClients}
            subtext={`${metrics.activeClients} Active Now`}
            icon={Users}
            gradientClass="bg-gradient-to-br from-violet-500 to-purple-600"
            onClick={() => onNavigate('clients')}
            delay={400}
         />
      </div>

      {/* Middle Section: Overview Chart + Overdue List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         
         {/* Financial Overview Charts (Bar + Pie) */}
         <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-lg"><Activity size={18} className="text-brand-600"/></div>
                  Financial Overview (Current Month)
               </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-72">
               {/* Bar Chart */}
               <div className="h-full bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-2 border border-gray-100 dark:border-gray-800">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={overviewData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.3} />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip 
                           contentStyle={{ backgroundColor: '#1f2937', borderRadius: '12px', border: 'none', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                           cursor={{fill: '#f3f4f6', opacity: 0.1}}
                        />
                        <Bar dataKey="amount" radius={[6, 6, 6, 6]}>
                           {overviewData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                           ))}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </div>
               {/* Pie Chart */}
               <div className="h-full relative border dark:border-gray-700 rounded-xl p-2 bg-white dark:bg-gray-800 flex flex-col items-center justify-center">
                  <h4 className="absolute top-4 left-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Distribution</h4>
                  <div className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                            cornerRadius={4}
                            >
                            {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '8px' }}/>
                            <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8}/>
                        </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                     <span className="text-2xl font-black text-gray-800 dark:text-white">
                        {Math.round(metrics.collectionRate)}%
                     </span>
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Collected</span>
                  </div>
               </div>
            </div>
         </div>

         {/* Overdue Section */}
         <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col hover:shadow-md transition-shadow animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                <h3 className="text-md font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-full"><AlertCircle size={16} className="text-red-500" /></div>
                    Overdue Clients
                </h3>
                <button onClick={() => onNavigate('clients')} className="text-[10px] text-brand-600 font-bold uppercase tracking-wide hover:bg-brand-50 px-2 py-1 rounded transition-colors">View All</button>
            </div>

            <div className="overflow-y-auto flex-1 max-h-[300px] custom-scrollbar p-2">
                {overdueClients.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center justify-center text-gray-400 h-full">
                    <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                        <TrendingUp size={32} className="text-green-500" />
                    </div>
                    <p className="font-medium">No significant overdue.</p>
                    <p className="text-xs mt-1 opacity-70">Great job collecting payments!</p>
                </div>
                ) : (
                <table className="w-full text-left text-sm border-separate border-spacing-y-1">
                    <thead className="text-gray-400 font-medium text-[10px] uppercase">
                        <tr>
                            <th className="px-3 pb-2">Client</th>
                            <th className="px-3 pb-2 text-right">Due</th>
                        </tr>
                    </thead>
                    <tbody>
                        {overdueClients.map(client => (
                            <tr 
                              key={client.id} 
                              className="bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer group rounded-lg border border-transparent hover:border-red-100 dark:hover:border-red-900/30 shadow-sm"
                              onClick={() => {
                                  if(onClientClick) onClientClick(client.displayClientId);
                                  if(addToast) addToast('warning', `Viewing overdue details for ${client.clientName}`);
                              }}
                            >
                            <td className="px-3 py-2.5 rounded-l-lg">
                                <span className="font-bold text-gray-800 dark:text-gray-200 block truncate max-w-[140px] group-hover:text-red-600 transition-colors text-xs" title={client.clientName}>{client.clientName}</span>
                                <span className="text-[9px] text-red-500 font-bold bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full inline-block mt-0.5">{client.overdueMonths} Months</span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-black text-red-600 rounded-r-lg text-xs">
                                {client.due.toLocaleString()}
                            </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>
         </div>
      </div>

      {/* Bottom Charts Section - CLIENT GROWTH REPORT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow lg:col-span-2 animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-lg"><Activity size={18} className="text-brand-600"/></div>
                    Client Growth Report ({new Date().getFullYear()})
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                        Total Left: <span className="font-bold text-red-500">{leftClientsList.length}</span>
                    </span>
                </div>
            </div>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={clientGrowthData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                        <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                        <Legend />
                        <Bar dataKey="New" fill="#34d399" radius={[4, 4, 0, 0]} barSize={20} name="New Lines" />
                        <Bar dataKey="Left" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} name="Churn (Left)" />
                        <Line type="monotone" dataKey="Active" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} name="Active Lines" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
         </div>
      </div>

      {/* Top Clients Widget (MOVED TO BOTTOM) */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-start gap-4 mb-4">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600">
                  <Award size={20} />
              </div>
              <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Top Clients - Paid On Time</h3>
                  <p className="text-xs text-gray-500">Based on payments made before the {state.settings.maxDueDate || 10}th of each month.</p>
              </div>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="text-gray-400 font-bold uppercase border-b border-gray-100 dark:border-gray-700">
                      <tr>
                          <th className="pb-3 pl-2">Client</th>
                          <th className="pb-3">Username</th>
                          <th className="pb-3">Last Payment</th>
                          <th className="pb-3 text-right">Total Paid</th>
                          <th className="pb-3 text-right pr-2">On-Time Rate</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {topClients.map((client, idx) => (
                          <tr key={client.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="py-3 pl-2 font-bold text-gray-700 dark:text-gray-200">
                                  {idx + 1}. {client.name}
                              </td>
                              <td className="py-3 text-gray-500 font-mono">{client.username}</td>
                              <td className="py-3 text-gray-500">{client.lastPayment ? new Date(client.lastPayment).toLocaleDateString() : '-'}</td>
                              <td className="py-3 text-right font-bold text-green-600">
                                  {state.settings.currencySymbol}{client.totalPaid.toLocaleString()}
                              </td>
                              <td className="py-3 text-right pr-2">
                                  <div className="flex items-center justify-end gap-2">
                                      <span className="font-bold text-gray-700 dark:text-gray-300">{client.onTimeRate}%</span>
                                      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div 
                                              className={`h-full rounded-full ${client.onTimeRate >= 80 ? 'bg-green-500' : client.onTimeRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                                              style={{ width: `${client.onTimeRate}%` }}
                                          ></div>
                                      </div>
                                  </div>
                              </td>
                          </tr>
                      ))}
                      {topClients.length === 0 && (
                          <tr>
                              <td colSpan={5} className="text-center py-4 text-gray-400">No payment data available yet.</td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};
