
import React, { useMemo, useState } from 'react';
import { GlobalState, ExpenseType } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart, AreaChart, Area } from 'recharts';
import { Printer, Calendar, DollarSign, Activity, FileText, TrendingUp, TrendingDown, Wallet, AlertCircle, AlertTriangle, Users, Download, Box } from '../components/ui/Icons';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportCenterProps {
  state: GlobalState;
}

export const ReportCenter: React.FC<ReportCenterProps> = ({ state }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Financial Data for the New Monitor Card
  const financialData = useMemo(() => {
     // Monthly metrics
     const monthRecords = state.records.filter(r => r.monthKey === selectedMonth);
     const monthExpenses = state.expenses.filter(e => e.date.startsWith(selectedMonth));
     
     const totalBillable = monthRecords.reduce((sum, r) => sum + r.payableAmount, 0);
     const collection = monthRecords.reduce((sum, r) => sum + r.paidAmount, 0);
     
     const expenseDebit = monthExpenses.filter(e => e.type === ExpenseType.DEBIT).reduce((sum, e) => sum + e.amount, 0);
     const otherIncome = monthExpenses.filter(e => e.type === ExpenseType.CREDIT && !e.relatedRecordId).reduce((sum, e) => sum + e.amount, 0);
     
     // Cash In Hand (Monthly Flow) = (Collection + Other Income) - Expense
     const cashInHand = (collection + otherIncome) - expenseDebit;

     // Market Due (Lifetime Snapshot) - Total unpaid amount currently in the market
     const marketDue = state.records.reduce((sum, r) => sum + (r.payableAmount - r.paidAmount), 0);

     // NEW: Inventory Value (Current Cost of Stock)
     const inventoryValue = (state.inventory || []).reduce((sum, item) => sum + (item.stockCount * item.buyPrice), 0);

     return { totalBillable, collection, expenseDebit, marketDue, cashInHand, inventoryValue };
  }, [state.records, state.expenses, selectedMonth, state.inventory]);

  // 1. Monthly Revenue Chart Data
  const monthlyRevenueData = useMemo(() => {
    const records = state.records.filter(r => r.monthKey === selectedMonth && r.paidAmount > 0);
    const dailyData: Record<number, number> = {};
    const daysInMonth = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0).getDate();
    
    for(let i=1; i<=daysInMonth; i++) dailyData[i] = 0;

    records.forEach(r => {
        const day = r.paymentDate ? parseInt(r.paymentDate.split('-')[2]) : 1;
        if(dailyData[day] !== undefined) dailyData[day] += r.paidAmount;
    });

    return Object.keys(dailyData).map(day => ({
        day: `Day ${day}`,
        revenue: dailyData[parseInt(day)]
    }));
  }, [state.records, selectedMonth]);

  // 2. Yearly Revenue vs Profit Chart Data
  const yearlyRevenueData = useMemo(() => {
     const data = [];
     for(let i=1; i<=12; i++) {
        const monthKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
        const records = state.records.filter(r => r.monthKey === monthKey);
        const collection = records.reduce((sum, r) => sum + r.paidAmount, 0);
        
        const monthExpenses = state.expenses.filter(e => e.date.startsWith(monthKey));
        const otherIncome = monthExpenses.filter(e => e.type === ExpenseType.CREDIT && !e.relatedRecordId).reduce((sum, e) => sum + e.amount, 0);
        const totalDebit = monthExpenses.filter(e => e.type === ExpenseType.DEBIT).reduce((sum, e) => sum + e.amount, 0);

        const totalIncome = collection + otherIncome;
        const netProfit = totalIncome - totalDebit;

        data.push({
            month: new Date(selectedYear, i-1).toLocaleString('default', { month: 'short' }),
            Revenue: totalIncome,
            Expense: totalDebit,
            Profit: netProfit,
        });
     }
     return data;
  }, [state.records, state.expenses, selectedYear]);

  // 3. Trend Data (Area Chart) - Moved from Dashboard
  const trendData = useMemo(() => {
    const allMonths = Array.from(new Set(state.records.map(r => r.monthKey))).sort();
    const last6Months = allMonths.slice(-6);
    // If fewer than 6 months, show what we have
    const monthsToShow = last6Months.length > 0 ? last6Months : [selectedMonth];

    return monthsToShow.map(month => {
       const monthRecords = state.records.filter(r => r.monthKey === month);
       const monthExpenses = state.expenses.filter(e => e.date.startsWith(month) && e.type === ExpenseType.DEBIT);

       const collection = monthRecords.reduce((sum, r) => sum + r.paidAmount, 0);
       const expense = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

       return {
          name: month,
          Collection: collection,
          Expense: expense
       };
    });
  }, [state.records, state.expenses, selectedMonth]);

  // 4. Expense Breakdown
  const expenseBreakdown = useMemo(() => {
     const expenses = state.expenses.filter(e => e.date.startsWith(selectedYear.toString()) && e.type === ExpenseType.DEBIT);
     const categories: Record<string, number> = {};
     
     expenses.forEach(e => {
        const cat = e.category || 'Uncategorized';
        categories[cat] = (categories[cat] || 0) + e.amount;
     });

     return Object.keys(categories).map(cat => ({
        name: cat,
        value: categories[cat]
     })).sort((a,b) => b.value - a.value);

  }, [state.expenses, selectedYear]);

  // 5. Financial Statement Logic
  const financialStatement = useMemo(() => {
     const records = state.records.filter(r => r.monthKey === selectedMonth);
     const totalBilled = records.reduce((sum, r) => sum + r.payableAmount, 0);
     const totalCollected = records.reduce((sum, r) => sum + r.paidAmount, 0);
     
     const monthExpenses = state.expenses.filter(e => e.date.startsWith(selectedMonth));
     const totalDebit = monthExpenses.filter(e => e.type === ExpenseType.DEBIT).reduce((sum, e) => sum + e.amount, 0);
     const otherIncome = monthExpenses.filter(e => e.type === ExpenseType.CREDIT && !e.relatedRecordId).reduce((sum, e) => sum + e.amount, 0);

     const profitWithdrawals = monthExpenses
        .filter(e => e.type === ExpenseType.DEBIT && e.category?.includes('(∆)'))
        .reduce((sum, e) => sum + e.amount, 0);

     const operationalExpense = totalDebit - profitWithdrawals;

     return {
        billed: totalBilled,
        collected: totalCollected,
        otherIncome: otherIncome,
        totalIncome: totalCollected + otherIncome,
        expenses: totalDebit,
        operationalExpenses: operationalExpense,
        profitWithdrawals: profitWithdrawals,
        netBalance: (totalCollected + otherIncome) - totalDebit
     };
  }, [state.records, state.expenses, selectedMonth]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

  const printSummary = () => {
     window.print();
  };

  const handlePrintStatement = () => {
    window.print();
  };

   const handleDownloadStatementPDF = () => {
      // Use explicit A4 portrait with point units for predictable widths
      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      const { settings } = state;
      const date = new Date().toLocaleString();
      const pdfCurrency = settings.currencySymbol === '৳' ? 'Tk ' : settings.currencySymbol;
      let y = 28; // start a bit lower for pt units

      // Use tighter margins for full width effect (points)
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18; // ~18pt margin
      const contentWidth = pageWidth - (margin * 2);

    // Header
   doc.setFontSize(22);
   doc.setFont('helvetica', 'bold');
   doc.text(settings.companyName, pageWidth / 2, y, { align: 'center' });
   y += 16;
   doc.setFontSize(14);
   doc.setFont('helvetica', 'normal');
   doc.setTextColor(100);
   doc.text('Statement of Profit & Loss', pageWidth / 2, y, { align: 'center' });
   y += 12;
   doc.setFontSize(10);
   doc.text(`Period: ${new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}`, pageWidth / 2, y, { align: 'center' });
   y += 14;
   doc.setDrawColor(220);
   doc.setLineWidth(0.5);
   doc.line(margin, y, pageWidth - margin, y);
   y += 12;

    // Helper to draw clean rows
   const drawRow = (label: string, value: number, isTotal = false) => {
      doc.setFontSize(11);
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setTextColor(isTotal ? 30 : 80);
      doc.text(label, margin, y);
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      // Align value exactly to the right margin
      doc.text(`${pdfCurrency}${value.toLocaleString()}`, pageWidth - margin, y, { align: 'right' });
      y += (isTotal ? 14 : 10);
   };

    // Revenue Section
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('REVENUE (CREDITS)', margin, y); y += 8;
    doc.setDrawColor(200); doc.line(margin, y - 2, pageWidth - margin, y - 2); y += 4;
    drawRow('Service Revenue (Collected)', financialStatement.collected);
    drawRow('Other Income Sources', financialStatement.otherIncome);
    doc.setDrawColor(230);
    doc.line(margin, y - 2, pageWidth - margin, y - 2); y+=2;
    drawRow('Total Income', financialStatement.totalIncome, true);
    y += 12;

    // Expenses Section
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('EXPENDITURE (DEBITS)', margin, y); y += 8;
    doc.setDrawColor(200); doc.line(margin, y - 2, pageWidth - margin, y - 2); y += 4;
    drawRow('Operational Expenses', financialStatement.operationalExpenses);
    if(financialStatement.profitWithdrawals > 0) {
      drawRow('Owner Withdrawals', financialStatement.profitWithdrawals);
    }
    doc.setDrawColor(230);
    doc.line(margin, y - 2, pageWidth - margin, y - 2); y+=2;
    drawRow('Total Expense', financialStatement.expenses, true);
    y += 15;
    
    // Final Balance Box
    doc.setFillColor(245, 247, 250);
    doc.rect(margin, y, contentWidth, 25, 'F');
    y+=10;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(50);
    doc.text('NET BALANCE', margin + 5, y + 5);
    doc.setFontSize(16);
    if (financialStatement.netBalance >= 0) doc.setTextColor(0, 128, 0);
    else doc.setTextColor(220, 38, 38);
    // Align balance value exactly to the right margin inside the box
    doc.text(`${pdfCurrency}${financialStatement.netBalance.toLocaleString()}`, pageWidth - margin - 5, y + 5, { align: 'right' });

    // Footer
    const footerText = `Document generated by ${settings.userName || 'System'} via ISPLedger | ${date}`;
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(footerText, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });

    doc.save(`P&L_Statement_${selectedMonth}.pdf`);
  };

  const generateMonthlyReport = () => {
      // Explicit A4 portrait in points for consistent full-width layout
      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      // ADJUSTED MARGINS FOR FULL WIDTH LOOK
      const margin = 18; // points
      const contentWidth = pageWidth - (margin * 2);
    
    // Config
    const company = state.settings.companyName;
    const user = state.settings.userName || 'Admin';
    const monthLabel = new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const pdfCurrency = state.settings.currencySymbol === '৳' ? 'Tk ' : state.settings.currencySymbol;
    const date = new Date().toLocaleString();

    // Footer on all pages
    const addFooter = () => {
        const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : 0;
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            const footerText = `Document generated by ${user} via ISPLedger | ${date}`;
            doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }
    };

   // Header
   doc.setFontSize(24);
   doc.setFont("helvetica", "bold");
   doc.text(company, pageWidth / 2, 28, { align: 'center' });
   doc.setFontSize(14);
   doc.setTextColor(100);
   doc.text("Executive Business Report", pageWidth / 2, 46, { align: 'center' });
   doc.setFontSize(11);
   doc.text(`Period: ${monthLabel}`, pageWidth / 2, 60, { align: 'center' });

    // Section 1: Financial Performance
   autoTable(doc, {
      startY: 72,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth, // Force full width
        head: [['1. Financial Executive Summary']],
        body: [
            ['Total Billed (Receivable)', `${pdfCurrency} ${financialStatement.billed.toLocaleString()}`],
            ['Total Collection (Realized)', `${pdfCurrency} ${financialStatement.collected.toLocaleString()}`],
            ['Total Operational Expenses', `(${pdfCurrency} ${financialStatement.operationalExpenses.toLocaleString()})`],
            ['Net Cash Flow (Monthly Balance)', { content: `${pdfCurrency} ${financialStatement.netBalance.toLocaleString()}`, styles: { fontStyle: 'bold', fontSize: 12 } }],
            ['', ''], // Spacer
            ['Total Market Outstanding (All Time)', { content: `${pdfCurrency} ${financialData.marketDue.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
            ['Current Stock Value (Assets)', { content: `${pdfCurrency} ${financialData.inventoryValue.toLocaleString()}`, styles: { fontStyle: 'bold' } }]
        ],
        theme: 'striped',
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontSize: 12, halign: 'left' },
      columnStyles: { 
         0: { cellWidth: Math.floor(contentWidth * 0.7) },
         1: { halign: 'right', cellWidth: Math.floor(contentWidth * 0.3) }
      },
      styles: { fontSize: 11, cellPadding: 6, overflow: 'linebreak' }
    });

    // Section 2: Client Dynamics
   const finalY1 = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 12 : 90;
    autoTable(doc, {
        startY: finalY1,
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        head: [['2. Client Growth Metrics']],
        body: [
            ['Active Clients (Start of Month)', state.records.filter(r => r.monthKey === selectedMonth && r.isActive).length],
            ['New Clients Joined', state.clients.filter(c => c.joiningDate && c.joiningDate.startsWith(selectedMonth)).length],
            ['Clients Left (Churned)', state.clients.filter(c => c.isArchived && c.leftDate && c.leftDate.startsWith(selectedMonth)).length],
            ['Total Active Clients (Current)', { content: state.clients.filter(c => !c.isArchived && c.isActive).length, styles: { fontStyle: 'bold' } }]
        ],
        theme: 'grid',
        headStyles: { fillColor: [40, 40, 40], fontSize: 12 },
      columnStyles: { 
         0: { cellWidth: Math.floor(contentWidth * 0.7) },
         1: { halign: 'right', fontStyle: 'bold', cellWidth: Math.floor(contentWidth * 0.3) } 
      },
      styles: { fontSize: 11, cellPadding: 6, overflow: 'linebreak' }
    });

    // Section 3: Expense Breakdown
   const finalY2 = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 12 : (finalY1 + 90);
    const expenseRows: any[] = expenseBreakdown.length > 0 ? expenseBreakdown.map(e => [e.name, `${pdfCurrency} ${e.value.toLocaleString()}`]) : [['No expenses recorded', '-']];
    expenseRows.push([{ content: 'Total Expenses', styles: { fontStyle: 'bold' } }, { content: `${pdfCurrency} ${financialStatement.expenses.toLocaleString()}`, styles: { fontStyle: 'bold' } }]);
    autoTable(doc, {
        startY: finalY2,
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        head: [['3. Expense Breakdown']],
        body: expenseRows,
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 12 },
      columnStyles: {
         0: { cellWidth: Math.floor(contentWidth * 0.7) },
         1: { halign: 'right', cellWidth: Math.floor(contentWidth * 0.3) }
      },
      styles: { fontSize: 11, cellPadding: 6, overflow: 'linebreak' }
    });

    addFooter();
    doc.save(`Executive_Report_${selectedMonth}.pdf`);
  };

   return (
      <>
         <style>{`@media print {
               .print-container { width:210mm !important; max-width:210mm !important; margin:0 !important; padding:0 !important; }
               .print-container * { box-shadow: none !important; }
               .print-container .print\\:hidden { display:none !important; }
               .print-container .print\\:block { display:block !important; }
         }`}</style>
         <div className="space-y-8 pb-10 print-container w-full print:w-full print:block">
      
      {/* Professional Print Header */}
      <div className="hidden print-header">
          <h1 className="print-header-company">{state.settings.companyName}</h1>
          <p className="print-header-title">Executive Business Summary</p>
          <p className="print-header-meta">Period: {new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
      
      {/* 1. Monthly Business Health Monitor */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 print:break-inside-avoid print:shadow-none print:border-none print:p-0 print:block print:w-full">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 print:hidden">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
               <Activity className="text-brand-600"/> Monthly Executive Summary
            </h2>
            <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={printSummary} className="flex-1 sm:flex-none text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white px-3 py-1.5 rounded flex justify-center items-center gap-2 transition-colors border border-gray-200 dark:border-gray-600">
                   <Printer size={16}/> <span className="whitespace-nowrap">Print Summary</span>
                </button>
                <button onClick={generateMonthlyReport} className="flex-1 sm:flex-none text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded flex justify-center items-center gap-2 transition-colors shadow-sm">
                   <Download size={16}/> <span className="whitespace-nowrap">Download PDF Report</span>
                </button>
            </div>
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 print:block print:w-full">
             {/* Cards */}
             <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/30 print:bg-white print:border print:border-gray-300 print:mb-2 print:break-inside-avoid">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1 print:text-black">Collection</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white print:text-black">{state.settings.currencySymbol}{financialData.collection.toLocaleString()}</p>
                    </div>
                </div>
             </div>
             <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30 print:bg-white print:border print:border-gray-300 print:mb-2 print:break-inside-avoid">
                <div>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1 print:text-black">Expense</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white print:text-black">{state.settings.currencySymbol}{financialData.expenseDebit.toLocaleString()}</p>
                </div>
             </div>
             <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30 print:bg-white print:border print:border-gray-300 print:mb-2 print:break-inside-avoid">
                <div>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1 print:text-black">Net Flow</p>
                    <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 print:text-black">{state.settings.currencySymbol}{financialData.cashInHand.toLocaleString()}</p>
                </div>
             </div>
             <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-900/30 print:bg-white print:border print:border-gray-300 print:mb-2 print:break-inside-avoid lg:block">
                <div>
                    <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1 print:text-black">Market Dues</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white print:text-black">{state.settings.currencySymbol}{financialData.marketDue.toLocaleString()}</p>
                </div>
             </div>
             <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-900/30 print:bg-white print:border print:border-gray-300 print:mb-2 print:break-inside-avoid lg:block">
                <div>
                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1 print:text-black">Stock Value</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white print:text-black">{state.settings.currencySymbol}{financialData.inventoryValue.toLocaleString()}</p>
                </div>
             </div>
         </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-t pt-8 dark:border-gray-700 print:hidden">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">Report Center</h1>
           <p className="text-sm text-gray-500">Analytics and Financial Statements</p>
        </div>
        <div className="flex gap-4">
           <div className="relative">
              <input type="month" value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setSelectedYear(parseInt(e.target.value.split('-')[0])); }} className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-brand-500 outline-none"/>
              <Calendar size={16} className="absolute left-3 top-2.5 text-gray-400" />
           </div>
           <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="pl-4 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-brand-500 outline-none">
              {[currentYear, currentYear-1, currentYear-2].map(y => <option key={y} value={y}>{y}</option>)}
           </select>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:hidden">
         <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
               <Activity size={20} className="text-brand-600" /> Financial Trend (Last 6 Months)
            </h3>
            <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorColl" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--brand-500)" stopOpacity={0.1}/><stop offset="95%" stopColor="var(--brand-500)" stopOpacity={0}/></linearGradient>
                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.3} />
                     <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                     <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                     <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderRadius: '12px', border: 'none', color: '#fff' }} />
                     <Legend wrapperStyle={{paddingTop: '20px'}} iconType="circle"/>
                     <Area type="monotone" dataKey="Collection" stroke="var(--brand-500)" strokeWidth={3} fillOpacity={1} fill="url(#colorColl)" activeDot={{r: 6}} />
                     <Area type="monotone" dataKey="Expense" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" activeDot={{r: 6}} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>
         <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
               <DollarSign size={20} className="text-green-600" /> Annual Profit/Loss Analysis ({selectedYear})
            </h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={yearlyRevenueData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                     <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                     <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                     <Legend />
                     <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                     <Bar dataKey="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                     <Line type="monotone" dataKey="Profit" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4}} />
                  </ComposedChart>
               </ResponsiveContainer>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block print:w-full">
         {/* Financial Statement */}
         <div className="lg:col-span-3 bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative print:shadow-none print:border-none print:p-0 print:block print:w-full">
             <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100 dark:border-gray-700 print:hidden">
                <div className="text-center md:text-left">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Statement of Profit & Loss</h2>
                  <p className="text-sm font-medium text-brand-600 mt-1">Period: {new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="flex gap-2 print:hidden">
                    <button onClick={handlePrintStatement} className="bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-700/50 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-gray-200 dark:border-gray-600" title="Print Statement"><Printer size={16} /></button>
                    <button onClick={handleDownloadStatementPDF} className="bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/20 dark:text-brand-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2" title="Download as PDF"><Download size={16} /></button>
                </div>
             </div>

             <div className="space-y-6 print:break-inside-avoid print:block print:w-full">
                <div className="print:mb-4">
                   <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 print:text-black print:text-lg print:border-b print:border-black print:pb-1">Income (Credits)</h4>
                   <div className="space-y-2">
                      <div className="flex justify-between text-gray-700 dark:text-gray-300 print:text-black"><span className="print:font-medium">Service Revenue</span><span className="font-mono">{state.settings.currencySymbol}{financialStatement.collected.toLocaleString()}</span></div>
                      <div className="flex justify-between text-gray-700 dark:text-gray-300 print:text-black"><span>Other Income</span><span className="font-mono">{state.settings.currencySymbol}{financialStatement.otherIncome.toLocaleString()}</span></div>
                      <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-2 border-t dark:border-gray-700 print:text-black print:border-gray-400"><span>Total Income</span><span className="font-mono">{state.settings.currencySymbol}{financialStatement.totalIncome.toLocaleString()}</span></div>
                   </div>
                </div>
                <div className="print:mb-4">
                   <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 print:text-black print:text-lg print:border-b print:border-black print:pb-1">Expenditure (Debits)</h4>
                   <div className="space-y-2">
                      <div className="flex justify-between text-gray-700 dark:text-gray-300 print:text-black"><span>Operational Expenses</span><span className="font-mono">{state.settings.currencySymbol}{financialStatement.operationalExpenses.toLocaleString()}</span></div>
                      {financialStatement.profitWithdrawals > 0 && (<div className="flex justify-between text-gray-700 dark:text-gray-300 print:text-black"><span>Owner Profit Withdrawal</span><span className="font-mono">{state.settings.currencySymbol}{financialStatement.profitWithdrawals.toLocaleString()}</span></div>)}
                      <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-2 border-t dark:border-gray-700 print:text-black print:border-gray-400"><span>Total Debit</span><span className="font-mono">{state.settings.currencySymbol}{financialStatement.expenses.toLocaleString()}</span></div>
                   </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl flex justify-between items-center border border-gray-200 dark:border-gray-700 print:bg-transparent print:border-2 print:border-black print:p-2 print:mt-4">
                   <div>
                       <span className="font-bold text-lg text-gray-800 dark:text-white print:text-black block">Net Balance</span>
                       <span className="text-xs text-gray-500 print:text-gray-600">(Income - Debits)</span>
                   </div>
                   <span className={`font-mono text-xl font-bold ${financialStatement.netBalance >= 0 ? 'text-green-600' : 'text-red-600'} print:text-black`}>{state.settings.currencySymbol}{financialStatement.netBalance.toLocaleString()}</span>
                </div>
             </div>
         </div>
      </div>
      
      {/* Standardized Print Footer */}
      <div className="hidden print-footer">
         <p>Document generated by {state.settings.userName || 'System'} via ISPLedger | {new Date().toLocaleString()}</p>
      </div>
      </div>
      </>
   );
};
