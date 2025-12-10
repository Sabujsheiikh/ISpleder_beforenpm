
import React, { useState, useMemo } from 'react';
import { GlobalState, ExpenseTransaction, ExpenseType } from '../types';
import { EXPENSE_CATEGORIES } from '../constants';
import { Plus, Trash2, FileText, Edit, TrendingUp, TrendingDown, ArrowRight, Wallet, Printer, Download } from '../components/ui/Icons';
import { Modal } from '../components/ui/Modal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExpenseManagerProps {
  state: GlobalState;
  updateState: (newState: GlobalState) => void;
}

export const ExpenseManager: React.FC<ExpenseManagerProps> = ({ state, updateState }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newExpense, setNewExpense] = useState<Partial<ExpenseTransaction>>({
    description: '', 
    category: '',
    amount: 0, 
    type: ExpenseType.DEBIT,
    date: new Date().toISOString().slice(0, 10) // Default to today YYYY-MM-DD
  });

  // Calculate Running Balance
  const transactionsWithBalance = useMemo(() => {
    let balance = 0;
    // Sort by date ascending for calculation
    const sorted = [...state.expenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return sorted.map(t => {
      if (t.type === ExpenseType.CREDIT) balance += t.amount;
      else balance -= t.amount;
      return { ...t, balance };
    }).reverse(); // Show newest first in UI
  }, [state.expenses]);

  const totals = useMemo(() => {
     return state.expenses.reduce((acc, t) => ({
        credit: acc.credit + (t.type === ExpenseType.CREDIT ? t.amount : 0),
        debit: acc.debit + (t.type === ExpenseType.DEBIT ? t.amount : 0)
     }), { credit: 0, debit: 0 });
  }, [state.expenses]);

  const openAddModal = () => {
    setEditingId(null);
    setNewExpense({
        description: '', 
        category: '',
        amount: 0, 
        type: ExpenseType.DEBIT,
        date: new Date().toISOString().slice(0, 10)
    });
    setIsModalOpen(true);
  };

  const openEditModal = (t: ExpenseTransaction) => {
    setEditingId(t.id);
    setNewExpense({
        description: t.description,
        category: t.category || '',
        amount: t.amount,
        type: t.type,
        date: t.date.split('T')[0] // Ensure YYYY-MM-DD format
    });
    setIsModalOpen(true);
  };

  const handleSaveTransaction = (e?: React.FormEvent) => {
    if(e) e.preventDefault(); // Prevent form default submission

    // Basic validation
    if (!newExpense.description || !newExpense.date) return;
    const amountVal = Number(newExpense.amount);
    if (isNaN(amountVal) || amountVal < 0) return;

    if (editingId) {
        // Update existing record
        const updatedExpenses = state.expenses.map(e => 
            e.id === editingId 
              ? { 
                  ...e, 
                  description: newExpense.description!, 
                  category: newExpense.category,
                  amount: amountVal, 
                  type: newExpense.type!, 
                  date: newExpense.date! 
                }
              : e
        );
        updateState({ ...state, expenses: updatedExpenses });
    } else {
        // Create new record
        const transaction: ExpenseTransaction = {
          id: crypto.randomUUID(),
          date: newExpense.date,
          description: newExpense.description,
          category: newExpense.category,
          amount: amountVal,
          type: newExpense.type || ExpenseType.DEBIT
        };
        updateState({ ...state, expenses: [...state.expenses, transaction] });
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    // Explicitly use window.confirm and ensure state update logic is clean
    if(window.confirm('Are you sure you want to permanently delete this entry?')) {
      const updatedExpenses = state.expenses.filter(e => e.id !== id);
      updateState({ ...state, expenses: updatedExpenses });
    }
  };

  const handleGenerateReport = (asPDF: boolean) => {
    if (asPDF) {
        const doc = new jsPDF();
        const { settings } = state;
        const date = new Date().toLocaleString();
        
        // FIX: Use a PDF-safe currency symbol to prevent character corruption.
        const pdfCurrency = settings.currencySymbol === '৳' ? 'Tk ' : settings.currencySymbol;

        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        // Header
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(settings.companyName, pageWidth / 2, 22, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Financial Transaction Report`, pageWidth / 2, 30, { align: 'center' });
        
        // Table Data (Chronological)
        const body = [...transactionsWithBalance].reverse().map(t => [
            new Date(t.date).toLocaleDateString(),
            t.category || '-',
            t.description,
            t.type === ExpenseType.CREDIT ? `${pdfCurrency}${t.amount.toLocaleString()}` : '',
            t.type === ExpenseType.DEBIT ? `${pdfCurrency}${t.amount.toLocaleString()}` : '',
            `${pdfCurrency}${t.balance.toLocaleString()}`
        ]);

        autoTable(doc, {
            head: [['Date', 'Category', 'Description', 'Credit (In)', 'Debit (Out)', 'Balance']],
            body: body,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] },
            // FIX: Let jspdf-autotable decide the best column widths based on content.
            // Only enforce right-alignment for currency columns.
            columnStyles: {
                3: { halign: 'right' }, // Credit
                4: { halign: 'right' }, // Debit
                5: { halign: 'right' }  // Balance
            },
            didDrawPage: (data) => {
                // Standardized Footer on every page
                const footerText = `Document generated by ${settings.userName || 'System'} via ISPLedger | ${date}`;
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
                doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
        });
        
        // FIX: Redesigned summary to match user's image with clean alignment.
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary', 14, finalY);

        const summaryStartY = finalY + 8;
        const valueX = pageWidth - 14; 
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);

        doc.text('Total Income (Credit):', 14, summaryStartY);
        doc.text(`${pdfCurrency}${totals.credit.toLocaleString()}`, valueX, summaryStartY, { align: 'right' });

        doc.text('Total Expense (Debit):', 14, summaryStartY + 7);
        doc.text(`${pdfCurrency}${totals.debit.toLocaleString()}`, valueX, summaryStartY + 7, { align: 'right' });
        
        doc.line(14, summaryStartY + 11, valueX, summaryStartY + 11);

        doc.text('Net Balance:', 14, summaryStartY + 16);
        doc.text(`${pdfCurrency}${(totals.credit - totals.debit).toLocaleString()}`, valueX, summaryStartY + 16, { align: 'right' });


        doc.save(`Financial_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } else {
        window.print();
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in print-container">
       <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 shrink-0 print:hidden">
        <div>
           <h1 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
             <Wallet size={24} className="text-brand-600"/> Expense & Income
           </h1>
           <p className="text-xs text-gray-500 mt-1">
             Manage day-to-day transactions and track cash flow.
           </p>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={() => handleGenerateReport(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm transition-colors font-medium"
              title="Print Report"
            >
              <Printer size={16} />
            </button>
            <button 
              onClick={() => handleGenerateReport(true)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm transition-colors font-medium"
              title="Download PDF"
            >
              <Download size={16} />
            </button>
            <button 
              onClick={openAddModal}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-brand-500/20 transition-all hover:scale-105 font-bold"
            >
              <Plus size={16} /> Add Entry
            </button>
        </div>
      </div>

      {/* Professional Print Header */}
      <div className="hidden print-header">
          <h1 className="print-header-company">{state.settings.companyName}</h1>
          <p className="print-header-title">Financial Transaction Report</p>
          <p className="print-header-meta">Generated on {new Date().toLocaleString()}</p>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative print:border-none print:shadow-none print:overflow-visible">
         <div className="overflow-auto flex-1 custom-scrollbar print:overflow-visible">
            <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-gray-50/90 dark:bg-gray-800/90 backdrop-blur text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 print:static print:bg-transparent">
                  <tr>
                    <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider print:px-2">Date</th>
                    <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider print:px-2">Category</th>
                    <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider print:px-2">Description</th>
                    <th className="px-5 py-3 text-right text-green-600 font-bold text-[10px] uppercase tracking-wider print:px-2 print:text-black">Credit (In)</th>
                    <th className="px-5 py-3 text-right text-red-600 font-bold text-[10px] uppercase tracking-wider print:px-2 print:text-black">Debit (Out)</th>
                    <th className="px-5 py-3 text-right font-bold text-[10px] uppercase tracking-wider print:px-2">Balance</th>
                    <th className="px-5 py-3 w-20 text-right font-bold text-[10px] uppercase tracking-wider print:hidden"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100 dark:divide-gray-800 print:divide-gray-300">
                  {transactionsWithBalance.map((t, idx) => (
                    <tr key={t.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors print:hover:bg-transparent print:break-inside-avoid">
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300 print:text-black font-mono text-xs print:px-2">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-xs print:text-black print:px-2">
                         {t.category ? (
                            <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 inline-block font-medium text-[10px] print:border-none print:bg-transparent print:p-0 print:text-black">
                                {t.category}
                            </span>
                         ) : <span className="text-gray-300 print:text-gray-400">-</span>}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200 print:text-black text-sm print:px-2">{t.description}</td>
                      <td className="px-5 py-3 text-right font-mono text-green-600 font-bold bg-green-50/30 dark:bg-green-900/10 text-sm print:bg-transparent print:text-black print:px-2">
                        {t.type === ExpenseType.CREDIT ? t.amount.toLocaleString() : ''}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-red-600 font-bold bg-red-50/30 dark:bg-red-900/10 text-sm print:bg-transparent print:text-black print:px-2">
                        {t.type === ExpenseType.DEBIT ? t.amount.toLocaleString() : ''}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-700 dark:text-gray-300 print:text-black font-mono text-sm print:px-2">
                        {state.settings.currencySymbol}{t.balance.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right print:hidden">
                         {!t.relatedRecordId && (
                           <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => openEditModal(t)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Edit">
                               <Edit size={16}/>
                             </button>
                             <button onClick={() => handleDelete(t.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Delete">
                               <Trash2 size={16}/>
                             </button>
                           </div>
                         )}
                         {t.relatedRecordId && <span className="text-[9px] text-gray-400 italic border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded">Auto</span>}
                      </td>
                    </tr>
                  ))}
               </tbody>
            </table>
            {transactionsWithBalance.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 text-gray-400 opacity-50 print:hidden">
                  <Wallet size={64} className="mb-4 text-gray-300 dark:text-gray-700" />
                  <p>No transactions recorded yet.</p>
              </div>
            )}
         </div>

         {/* Professional Summary Footer */}
         <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm sticky bottom-0 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] print:static print:border-t-2 print:shadow-none print:border-black print:grid print:grid-cols-3 print:gap-4 print:mt-4 print:break-inside-avoid">
            <div className="flex justify-between items-center bg-green-50/50 dark:bg-green-900/10 p-3 rounded-xl border border-green-100 dark:border-green-900/20 print:bg-transparent print:border print:border-gray-300 print:block print:text-center">
                <span className="text-gray-500 dark:text-gray-400 print:text-gray-600 print:text-xs font-bold uppercase block mb-1">Total Income</span>
                <span className="font-bold text-green-600 print:text-black text-lg">{state.settings.currencySymbol}{totals.credit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center bg-red-50/50 dark:bg-red-900/10 p-3 rounded-xl border border-red-100 dark:border-red-900/20 print:bg-transparent print:border print:border-gray-300 print:block print:text-center">
                <span className="text-gray-500 dark:text-gray-400 print:text-gray-600 print:text-xs font-bold uppercase block mb-1">Total Expense</span>
                <span className="font-bold text-red-600 print:text-black text-lg">{state.settings.currencySymbol}{totals.debit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/30 p-3 rounded-xl border border-gray-100 dark:border-gray-600 print:bg-transparent print:border print:border-gray-300 print:block print:text-center">
                <span className="font-bold text-gray-800 dark:text-white print:text-black print:text-xs font-bold uppercase block mb-1">Net Balance</span>
                <span className={`font-black text-lg px-2 py-0.5 rounded ${totals.credit - totals.debit >= 0 ? 'text-green-600' : 'text-red-600'} print:text-black print:bg-transparent`}>
                    {state.settings.currencySymbol}{(totals.credit - totals.debit).toLocaleString()}
                </span>
            </div>
         </div>
      </div>

      {/* Standardized Print Footer */}
      <div className="hidden print-footer">
         <p>Document generated by {state.settings.userName || 'System'} via ISPLedger | {new Date().toLocaleString()}</p>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Transaction" : "Add Transaction"}>
        <form className="space-y-5" onSubmit={handleSaveTransaction}>
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Transaction Type</label>
             <div className="flex gap-3">
               <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-4 py-3 rounded-xl border transition-all ${newExpense.type === ExpenseType.DEBIT ? 'bg-red-50 border-red-200 text-red-700 ring-2 ring-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}>
                 <input type="radio" className="hidden" checked={newExpense.type === ExpenseType.DEBIT} onChange={() => setNewExpense({...newExpense, type: ExpenseType.DEBIT})} />
                 <TrendingDown size={20} />
                 <span className="font-bold">Expense (Out)</span>
               </label>
               <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-4 py-3 rounded-xl border transition-all ${newExpense.type === ExpenseType.CREDIT ? 'bg-green-50 border-green-200 text-green-700 ring-2 ring-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700'}`}>
                 <input type="radio" className="hidden" checked={newExpense.type === ExpenseType.CREDIT} onChange={() => setNewExpense({...newExpense, type: ExpenseType.CREDIT})} />
                 <TrendingUp size={20} />
                 <span className="font-bold">Income (In)</span>
               </label>
             </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Date</label>
                    <input 
                        type="date"
                        className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none transition-shadow" 
                        value={newExpense.date}
                        onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Amount</label>
                    <input 
                        className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white border-gray-200 dark:border-gray-700 font-mono focus:ring-2 focus:ring-brand-500 outline-none transition-shadow text-lg font-bold" 
                        type="number"
                        placeholder="0.00"
                        value={newExpense.amount || ''}
                        onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})}
                        autoFocus
                    />
                </div>
           </div>

           <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input 
                list="expense_categories"
                className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none transition-shadow" 
                placeholder="Select or Type Category"
                value={newExpense.category}
                onChange={e => setNewExpense({...newExpense, category: e.target.value})}
              />
              <datalist id="expense_categories">
                 {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
           </div>

           <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input 
                className="w-full border p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none transition-shadow" 
                placeholder="Details about transaction"
                value={newExpense.description}
                onChange={e => setNewExpense({...newExpense, description: e.target.value})}
              />
           </div>

           <button type="submit" className="w-full bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 font-bold shadow-lg shadow-brand-500/20 mt-4 transition-transform active:scale-[0.98]">
             {editingId ? 'Update Transaction' : 'Save Transaction'}
           </button>
        </form>
      </Modal>
    </div>
  );
};
