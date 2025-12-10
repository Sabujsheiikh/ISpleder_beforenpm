
import React, { useState, useMemo } from 'react';
import { GlobalState, InventoryItem, ToastType, ExpenseType, ExpenseTransaction, InventoryTransaction } from '../types';
import { Box, Plus, Search, Edit, Trash2, Package, User, Calendar, DollarSign, Activity, MapPin, ShoppingCart, Minus, AlertTriangle, Eye, Info, History } from '../components/ui/Icons';
import { Modal } from '../components/ui/Modal';

interface InventoryProps {
  state: GlobalState;
  updateState: (newState: GlobalState) => void;
  addToast: (type: ToastType, msg: string) => void;
}

export const Inventory: React.FC<InventoryProps> = ({ state, updateState, addToast }) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'assets' | 'log'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Edit State
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem>>({ 
      type: 'Router', 
      purchaseDate: new Date().toISOString().slice(0, 10) 
  });
  const [stockToAdd, setStockToAdd] = useState<number>(0);

  // Stock Out State
  const [isStockOutModalOpen, setIsStockOutModalOpen] = useState(false);
  const [stockOutData, setStockOutData] = useState({ itemId: '', quantity: 1, reason: 'Damaged', refundAmount: 0, remarks: '' });

  // View Modal State
  const [viewItem, setViewItem] = useState<InventoryItem | null>(null);

  const inventory = state.inventory || []; 
  const inventoryHistory = state.inventoryHistory || [];

  // Log Book Data (Combined History)
  const logBookData = useMemo(() => {
    // We only show the persistent history log + computed legacy distributions for backward compatibility if needed
    // For now, let's prioritize the new persistent log.
    // If we want to show assignment log as well, we can check client assets.
    // However, the cleanest way is to just use inventoryHistory which we will populate from now on.
    return [...inventoryHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inventoryHistory]);

  // Computed: Active Assets
  const activeAssets = useMemo(() => {
      const active: any[] = [];
      state.clients.forEach(c => {
          if (c.assignedAssets) {
              c.assignedAssets.filter(a => a.status === 'Lent' || a.status === 'Free').forEach(a => {
                  active.push({
                      id: a.id,
                      clientId: c.id,
                      displayId: c.clientId,
                      clientName: c.name,
                      area: c.area,
                      itemName: a.name,
                      date: a.assignedDate,
                      status: a.status
                  });
              });
          }
      });
      return active.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.clients]);

  // Filtered Lists
  const filteredStock = inventory.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.type.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredAssets = activeAssets.filter(a => a.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || a.itemName.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSaveItem = () => {
      // Validate Name and Type
      if(!editingItem.name || !editingItem.type) {
          addToast('error', 'Please enter item name and type');
          return;
      }
      
      let newInventory = [...inventory];
      let newExpenses = [...state.expenses];
      let newHistory = [...inventoryHistory];

      const today = new Date().toISOString().slice(0, 10);
      const transactionDate = editingItem.purchaseDate || today;
      const buyPrice = Number(editingItem.buyPrice) || 0;
      
      if(editingItem.id) {
          // UPDATE EXISTING ITEM
          // Logic: If user added stock via the "Add Stock" field in modal
          if (stockToAdd > 0) {
             const cost = stockToAdd * buyPrice;
             
             // 1. Create Expense Debit
             const expense: ExpenseTransaction = {
                 id: crypto.randomUUID(),
                 date: transactionDate,
                 amount: cost,
                 type: ExpenseType.DEBIT,
                 category: 'Inventory Purchase',
                 description: `Restock: ${stockToAdd}x ${editingItem.name} from ${editingItem.supplierName || 'Supplier'}`
             };
             newExpenses.push(expense);
             
             // 2. Log Transaction
             newHistory.push({
                 id: crypto.randomUUID(),
                 date: transactionDate,
                 itemId: editingItem.id,
                 itemName: editingItem.name || 'Unknown',
                 type: 'Restock',
                 quantity: stockToAdd,
                 remarks: `Supplier: ${editingItem.supplierName || 'N/A'}`
             });

             // 3. Update Inventory Counters
             newInventory = newInventory.map(i => {
                 if (i.id === editingItem.id) {
                     return {
                         ...i,
                         name: editingItem.name!,
                         type: editingItem.type!,
                         buyPrice: buyPrice,
                         sellPrice: Number(editingItem.sellPrice) || 0,
                         stockCount: i.stockCount + stockToAdd, // Add new stock to existing
                         totalBought: (i.totalBought || 0) + stockToAdd,
                         totalCost: (i.totalCost || 0) + cost,
                         description: editingItem.description,
                         supplierName: editingItem.supplierName,
                         supplierAddress: editingItem.supplierAddress,
                         purchaseDate: transactionDate // Update latest purchase date
                     };
                 }
                 return i;
             });
             addToast('success', `Stock updated & ${state.settings.currencySymbol}${cost} expense recorded.`);
          } else {
             // Just updating details, no stock change
             newInventory = newInventory.map(i => i.id === editingItem.id ? { ...i, ...editingItem, stockCount: i.stockCount } as InventoryItem : i); // Keep stock same
             addToast('success', 'Item details updated');
          }

      } else {
          // CREATE NEW ITEM
          const initialStock = Number(editingItem.stockCount) || 0;
          const totalCost = initialStock * buyPrice;

          const newItem: InventoryItem = {
              id: crypto.randomUUID(),
              name: editingItem.name,
              type: editingItem.type,
              buyPrice: buyPrice,
              sellPrice: Number(editingItem.sellPrice) || 0,
              stockCount: initialStock,
              initialStock: initialStock, // Explicitly tracking initial
              totalBought: initialStock,
              totalCost: totalCost,
              description: editingItem.description || '',
              supplierName: editingItem.supplierName,
              supplierAddress: editingItem.supplierAddress,
              purchaseDate: transactionDate
          };
          newInventory.push(newItem);

          // If starting with stock, record expense
          if (initialStock > 0) {
              if (totalCost > 0) {
                const expense: ExpenseTransaction = {
                    id: crypto.randomUUID(),
                    date: transactionDate,
                    amount: totalCost,
                    type: ExpenseType.DEBIT,
                    category: 'Inventory Purchase',
                    description: `Initial Stock: ${initialStock}x ${newItem.name} from ${newItem.supplierName || 'Supplier'}`
                };
                newExpenses.push(expense);
              }

              // Log Transaction
              newHistory.push({
                 id: crypto.randomUUID(),
                 date: transactionDate,
                 itemId: newItem.id,
                 itemName: newItem.name,
                 type: 'Purchase',
                 quantity: initialStock,
                 remarks: `Initial Purchase. Supplier: ${newItem.supplierName || 'N/A'}`
             });

             addToast('success', `Item added & ${state.settings.currencySymbol}${totalCost} expense recorded.`);
          } else {
             addToast('success', 'New item added to stock list');
          }
      }
      
      updateState({...state, inventory: newInventory, expenses: newExpenses, inventoryHistory: newHistory});
      setIsModalOpen(false);
      setStockToAdd(0);
  };

  const handleStockOut = () => {
    const item = inventory.find(i => i.id === stockOutData.itemId);
    if (!item) return;

    const qty = Number(stockOutData.quantity);
    if (qty <= 0 || qty > item.stockCount) {
        addToast('error', 'Invalid quantity. Cannot exceed current stock.');
        return;
    }

    const newItem = { ...item, stockCount: item.stockCount - qty };
    const newInventory = inventory.map(i => i.id === item.id ? newItem : i);
    let newExpenses = [...state.expenses];
    const newHistory = [...inventoryHistory];
    const today = new Date().toISOString().slice(0, 10);

    // Log Transaction
    newHistory.push({
        id: crypto.randomUUID(),
        date: today,
        itemId: item.id,
        itemName: item.name,
        type: 'StockOut',
        quantity: qty,
        remarks: `${stockOutData.reason}: ${stockOutData.remarks}`
    });

    // If Returned and getting refund
    if (stockOutData.reason === 'Returned' && stockOutData.refundAmount > 0) {
        newExpenses.push({
            id: crypto.randomUUID(),
            date: today,
            amount: Number(stockOutData.refundAmount),
            type: ExpenseType.CREDIT,
            category: 'Inventory Return',
            description: `Returned ${qty}x ${item.name} (${stockOutData.remarks})`
        });
    }

    updateState({ ...state, inventory: newInventory, expenses: newExpenses, inventoryHistory: newHistory });
    setIsStockOutModalOpen(false);
    addToast('success', `Removed ${qty} ${item.name} from stock.`);
  };

  const handleDelete = (id: string) => {
      if(confirm("Delete this item from inventory?")) {
          updateState({...state, inventory: inventory.filter(i => i.id !== id)});
          addToast('info', 'Item deleted');
      }
  };

  const openStockOutModal = (itemId: string) => {
      setStockOutData({ itemId, quantity: 1, reason: 'Damaged', refundAmount: 0, remarks: '' });
      setIsStockOutModalOpen(true);
  };

  const openViewModal = (item: InventoryItem) => {
      setViewItem(item);
  };

  // Helper for conditional labels
  const isCable = editingItem.type === 'Cable' || editingItem.type === 'Fiber' || editingItem.type?.toLowerCase().includes('cable');

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 shrink-0 gap-4">
            <div>
                <h1 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Box size={24} className="text-brand-600"/> Inventory Management
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                    Track stock, purchases, and assets.
                </p>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                <button 
                    onClick={() => setActiveTab('stock')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'stock' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    Stock
                </button>
                <button 
                    onClick={() => setActiveTab('assets')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'assets' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    Active Assets
                </button>
                <button 
                    onClick={() => setActiveTab('log')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'log' ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    Log Book
                </button>
            </div>

            <div className="flex gap-2 w-full md:w-auto items-center">
                <div className="relative hidden md:block">
                    <input 
                        className="pl-8 pr-3 py-2 text-xs border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-700 outline-none focus:border-brand-500"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
                </div>
                {activeTab === 'stock' && (
                    <button 
                        onClick={() => { 
                            setEditingItem({ type: '', stockCount: 0, buyPrice: 0, sellPrice: 0, supplierName: '', supplierAddress: '', purchaseDate: new Date().toISOString().slice(0, 10) }); 
                            setStockToAdd(0);
                            setIsModalOpen(true); 
                        }}
                        className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs shadow-lg shadow-brand-500/20 transition-all hover:scale-105 font-bold whitespace-nowrap"
                    >
                        <Plus size={14} /> Add Item
                    </button>
                )}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative">
            
            {activeTab === 'stock' && (
                <div className="flex-1 overflow-auto custom-scrollbar p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredStock.map(item => (
                            <div key={item.id} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                                <div className={`absolute top-0 right-0 p-2 opacity-10 ${item.stockCount > 0 ? 'bg-brand-500' : 'bg-red-500'} rounded-bl-3xl`}>
                                     <Package size={40} className="text-white" />
                                </div>
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <div 
                                        className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-brand-50 transition-colors"
                                        onClick={() => openViewModal(item)}
                                    >
                                        <Package size={20} className="text-brand-500" />
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-lg shadow-sm p-0.5">
                                        <button onClick={() => openViewModal(item)} className="p-1.5 hover:bg-brand-50 dark:hover:bg-brand-900/30 text-brand-600 rounded transition-colors" title="Full Details"><Eye size={14}/></button>
                                        <button onClick={() => openStockOutModal(item.id)} className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/30 text-orange-600 rounded transition-colors" title="Stock Out (Lost/Damage/Return)"><Minus size={14}/></button>
                                        <button onClick={() => { setEditingItem(item); setStockToAdd(0); setIsModalOpen(true); }} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 rounded transition-colors" title="Edit / Restock"><Edit size={14}/></button>
                                        <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 rounded transition-colors"><Trash2 size={14}/></button>
                                    </div>
                                </div>
                                <h3 className="font-bold text-gray-800 dark:text-white truncate pr-6 cursor-pointer hover:text-brand-600" onClick={() => openViewModal(item)}>{item.name}</h3>
                                <div className="flex items-center gap-2 mt-1 mb-2">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{item.type}</span>
                                </div>
                                
                                <div className="space-y-1.5 flex-1 pt-2">
                                     {item.supplierName && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                            <ShoppingCart size={10} /> <span className="truncate">{item.supplierName}</span>
                                        </div>
                                     )}
                                     <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Total Bought</span>
                                        <span className="font-mono font-medium">{item.totalBought || 0}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Total Cost</span>
                                        <span className="font-mono font-medium">{state.settings.currencySymbol}{(item.totalCost || 0).toLocaleString()}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Buy Price</span>
                                        <span className="font-mono font-medium">{state.settings.currencySymbol}{item.buyPrice}</span>
                                     </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-end bg-white dark:bg-gray-800 p-2 rounded-lg">
                                    <div>
                                        <p className="text-[9px] text-gray-500 uppercase font-bold">Current Stock</p>
                                        <p className={`text-xl font-black ${item.stockCount > 0 ? 'text-gray-800 dark:text-white' : 'text-red-500'}`}>{item.stockCount}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-bold text-green-600 block">Sell</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{state.settings.currencySymbol}{item.sellPrice}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredStock.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
                                <Box size={40} className="mb-4 opacity-20" />
                                <p>No items found.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'assets' && (
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 border-b dark:border-gray-700 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">Client</th>
                                <th className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">Area</th>
                                <th className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">Item Assigned</th>
                                <th className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">Assigned Date</th>
                                <th className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {filteredAssets.map((asset, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-brand-50 dark:bg-brand-900/30 rounded text-brand-600">
                                                <User size={14} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-gray-200 text-xs">{asset.clientName}</p>
                                                <p className="text-xs text-gray-400 font-mono">{asset.displayId}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-xs text-gray-500">{asset.area}</td>
                                    <td className="px-6 py-3 font-medium text-gray-800 dark:text-gray-300">
                                        {asset.itemName}
                                    </td>
                                    <td className="px-6 py-3 text-xs text-gray-500 flex items-center gap-2">
                                        <Calendar size={12} /> {asset.date}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            asset.status === 'Lent' 
                                              ? 'bg-orange-100 text-orange-700 border border-orange-200' 
                                              : 'bg-purple-100 text-purple-700 border border-purple-200'
                                        }`}>
                                            {asset.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        </table>
                </div>
            )}

            {activeTab === 'log' && (
                <div className="flex-1 overflow-auto custom-scrollbar">
                     <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 border-b dark:border-gray-700 sticky top-0 z-10">
                            <tr>
                                <th className="px-5 py-3 font-bold text-[10px] uppercase">Date</th>
                                <th className="px-5 py-3 font-bold text-[10px] uppercase">Action</th>
                                <th className="px-5 py-3 font-bold text-[10px] uppercase">Item</th>
                                <th className="px-5 py-3 font-bold text-[10px] uppercase text-right">Qty</th>
                                <th className="px-5 py-3 font-bold text-[10px] uppercase">Details / Client</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {logBookData.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-5 py-3 text-gray-500 text-xs font-mono">{log.date}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                            log.type === 'Purchase' || log.type === 'Restock' || log.type === 'Return' 
                                            ? 'bg-green-50 text-green-700 border-green-200' 
                                            : log.type === 'Assign' 
                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                            : 'bg-red-50 text-red-700 border-red-200'
                                        }`}>
                                            {log.type}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-gray-800 dark:text-gray-300 font-medium">{log.itemName}</td>
                                    <td className="px-5 py-3 text-right font-mono text-xs">{log.quantity}</td>
                                    <td className="px-5 py-3 text-xs text-gray-600 dark:text-gray-400">
                                        {log.clientName && <span className="font-bold text-brand-600 mr-2">{log.clientName}</span>}
                                        <span className="italic">{log.remarks}</span>
                                    </td>
                                </tr>
                            ))}
                            {logBookData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-gray-400">
                                        <History size={32} className="mx-auto mb-2 opacity-30" />
                                        No logs found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem.id ? "Edit Stock Item" : "Add New Inventory Item"}>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                <div>
                    <label className="text-xs text-gray-500 font-bold uppercase">Item Name</label>
                    <input 
                        className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" 
                        placeholder="e.g. TP-Link Archer C20" 
                        value={editingItem.name || ''} 
                        onChange={e => setEditingItem({...editingItem, name: e.target.value})} 
                        onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                        autoFocus 
                    />
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Purchase Details</p>
                    <div className="grid grid-cols-2 gap-3">
                         <div>
                            <label className="text-xs text-gray-500 font-bold uppercase">Purchase Date</label>
                            <input type="date" className="w-full border p-2.5 rounded-lg bg-white dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm" value={editingItem.purchaseDate || ''} onChange={e => setEditingItem({...editingItem, purchaseDate: e.target.value})} />
                        </div>
                         <div>
                            <label className="text-xs text-gray-500 font-bold uppercase">Buying Shop</label>
                            <input 
                                className="w-full border p-2.5 rounded-lg bg-white dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm" 
                                placeholder="Supplier Name" 
                                value={editingItem.supplierName || ''} 
                                onChange={e => setEditingItem({...editingItem, supplierName: e.target.value})} 
                                onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase">Address / Contact</label>
                        <input 
                            className="w-full border p-2.5 rounded-lg bg-white dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm" 
                            placeholder="Shop Address or Phone" 
                            value={editingItem.supplierAddress || ''} 
                            onChange={e => setEditingItem({...editingItem, supplierAddress: e.target.value})} 
                            onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase">Type</label>
                        <input 
                            list="item_types"
                            className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" 
                            value={editingItem.type || ''} 
                            onChange={e => setEditingItem({...editingItem, type: e.target.value})}
                            placeholder="Select or Type"
                            onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                        />
                        <datalist id="item_types">
                            <option value="Router" />
                            <option value="ONU" />
                            <option value="Cable" />
                            <option value="Splitter" />
                            <option value="Switch" />
                            <option value="Fiber" />
                            <option value="Other" />
                        </datalist>
                    </div>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase">{isCable ? 'Buy Price (Per Meter)' : 'Buy Price (Unit)'}</label>
                        <input 
                            type="number" 
                            className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none" 
                            value={editingItem.buyPrice !== undefined ? editingItem.buyPrice : ''} 
                            onChange={e => setEditingItem({...editingItem, buyPrice: Number(e.target.value)})} 
                            onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 font-bold uppercase">{isCable ? 'Sell Price (Per Meter)' : 'Sell Price (Unit)'}</label>
                        <input 
                            type="number" 
                            className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 text-green-600 font-bold focus:ring-2 focus:ring-brand-500 outline-none" 
                            value={editingItem.sellPrice !== undefined ? editingItem.sellPrice : ''} 
                            onChange={e => setEditingItem({...editingItem, sellPrice: Number(e.target.value)})} 
                            onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                        />
                    </div>
                </div>

                <div className="bg-brand-50 dark:bg-brand-900/20 p-4 rounded-xl border border-brand-100 dark:border-brand-800">
                    <label className="text-xs text-brand-600 font-bold uppercase mb-2 block flex items-center gap-1">
                        <DollarSign size={14}/> 
                        {editingItem.id ? "Purchase Additional Stock" : (isCable ? "Initial Stock (Meters)" : "Initial Stock")}
                    </label>
                    <div className="flex gap-4 items-center">
                        <div className="flex-1">
                            <input 
                                type="number" 
                                className="w-full border p-2.5 rounded-lg bg-white dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 font-black text-lg text-center focus:ring-2 focus:ring-brand-500 outline-none" 
                                value={editingItem.id ? stockToAdd : (editingItem.stockCount || '')}
                                onChange={e => {
                                    if(editingItem.id) setStockToAdd(Number(e.target.value));
                                    else setEditingItem({...editingItem, stockCount: Number(e.target.value)});
                                }}
                                onKeyDown={e => e.key === 'Enter' && handleSaveItem()}
                                placeholder="Qty"
                            />
                        </div>
                        <div className="text-right">
                             <p className="text-xs text-gray-500">Total Cost</p>
                             <p className="font-bold text-red-500 text-lg">
                                {state.settings.currencySymbol}
                                {((editingItem.id ? stockToAdd : (editingItem.stockCount || 0)) * (editingItem.buyPrice || 0)).toLocaleString()}
                             </p>
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 italic flex items-center gap-1">
                        <Activity size={10}/> This will record expense and log in Log Book.
                    </p>
                </div>

                <button onClick={handleSaveItem} className="w-full bg-brand-600 text-white py-3 rounded-lg hover:bg-brand-700 font-bold shadow-lg mt-2 transition-transform active:scale-[0.98]">
                    {editingItem.id ? "Update & Restock" : "Add Item"}
                </button>
            </div>
        </Modal>

        {/* Stock Out Modal */}
        <Modal isOpen={isStockOutModalOpen} onClose={() => setIsStockOutModalOpen(false)} title="Stock Adjustment / Out">
            <div className="space-y-4">
                 <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl flex gap-3 border border-orange-100 dark:border-orange-900/30">
                    <AlertTriangle size={24} className="text-orange-500 shrink-0" />
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                        Use this to remove items from stock due to damage, loss, or return to supplier.
                    </p>
                 </div>

                 <div>
                    <label className="text-xs text-gray-500 font-bold uppercase">Reason</label>
                    <select 
                        className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 outline-none"
                        value={stockOutData.reason}
                        onChange={e => setStockOutData({...stockOutData, reason: e.target.value})}
                    >
                        <option value="Damaged">Damaged</option>
                        <option value="Lost">Lost</option>
                        <option value="Returned">Returned to Supplier</option>
                        <option value="Internal">Internal Use</option>
                        <option value="Other">Other</option>
                    </select>
                 </div>

                 <div>
                    <label className="text-xs text-gray-500 font-bold uppercase">Quantity to Remove</label>
                    <input 
                        type="number" 
                        className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 font-bold text-lg"
                        value={stockOutData.quantity}
                        onChange={e => setStockOutData({...stockOutData, quantity: Number(e.target.value)})}
                    />
                 </div>

                 {stockOutData.reason === 'Returned' && (
                     <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-800">
                        <label className="text-xs text-green-700 font-bold uppercase mb-1 block">Refund Amount (Cash In)</label>
                        <input 
                            type="number" 
                            className="w-full border p-2.5 rounded-lg bg-white dark:bg-gray-900 dark:text-white border-green-200 outline-none font-bold"
                            value={stockOutData.refundAmount}
                            onChange={e => setStockOutData({...stockOutData, refundAmount: Number(e.target.value)})}
                            placeholder="Amount received"
                        />
                        <p className="text-[10px] text-green-600 mt-1">This will record a Credit (Income) transaction.</p>
                     </div>
                 )}

                 <div>
                    <label className="text-xs text-gray-500 font-bold uppercase">Remarks</label>
                    <textarea 
                        className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 outline-none text-sm"
                        rows={2}
                        value={stockOutData.remarks}
                        onChange={e => setStockOutData({...stockOutData, remarks: e.target.value})}
                        placeholder="Details..."
                    />
                 </div>

                 <button onClick={handleStockOut} className="w-full bg-orange-600 text-white py-3 rounded-lg hover:bg-orange-700 font-bold shadow-lg mt-2">
                    Confirm Stock Out
                 </button>
            </div>
        </Modal>

        {/* View Details Modal */}
        {viewItem && (
            <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title="Item Details">
                <div className="space-y-6">
                    <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 dark:text-white">{viewItem.name}</h2>
                            <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-xs font-bold uppercase">{viewItem.type}</span>
                        </div>
                        <div className="text-right">
                             <p className="text-xs text-gray-400 font-bold uppercase">Current Stock</p>
                             <p className="text-3xl font-black text-gray-800 dark:text-white">{viewItem.stockCount}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                         <div className="space-y-1">
                             <p className="text-xs text-gray-400 font-bold uppercase">Financials</p>
                             <div className="flex justify-between text-sm"><span className="text-gray-600">Buy Price:</span> <span className="font-mono font-bold">{state.settings.currencySymbol}{viewItem.buyPrice}</span></div>
                             <div className="flex justify-between text-sm"><span className="text-gray-600">Sell Price:</span> <span className="font-mono font-bold">{state.settings.currencySymbol}{viewItem.sellPrice}</span></div>
                             <div className="flex justify-between text-sm pt-2 border-t"><span className="text-gray-600">Total Invested:</span> <span className="font-mono font-bold">{state.settings.currencySymbol}{viewItem.totalCost}</span></div>
                         </div>
                         <div className="space-y-1">
                             <p className="text-xs text-gray-400 font-bold uppercase">Statistics</p>
                             <div className="flex justify-between text-sm"><span className="text-gray-600">Total Units Bought:</span> <span className="font-mono font-bold">{viewItem.totalBought}</span></div>
                         </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-3">
                         <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><ShoppingCart size={12}/> Supplier Info</h4>
                         <div className="grid grid-cols-2 gap-4 text-sm">
                             <div>
                                 <span className="text-gray-400 block text-[10px] uppercase">Shop Name</span>
                                 <span className="font-medium text-gray-800 dark:text-gray-200">{viewItem.supplierName || 'N/A'}</span>
                             </div>
                             <div>
                                 <span className="text-gray-400 block text-[10px] uppercase">Contact/Address</span>
                                 <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{viewItem.supplierAddress || 'N/A'}</span>
                             </div>
                             <div>
                                 <span className="text-gray-400 block text-[10px] uppercase">Last Purchase Date</span>
                                 <span className="font-medium text-gray-800 dark:text-gray-200">{viewItem.purchaseDate || 'N/A'}</span>
                             </div>
                         </div>
                    </div>
                    
                    {viewItem.description && (
                        <div>
                             <p className="text-xs text-gray-400 font-bold uppercase mb-1">Description</p>
                             <p className="text-sm text-gray-600 dark:text-gray-300 italic">{viewItem.description}</p>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button onClick={() => setViewItem(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded-lg text-sm font-bold">Close</button>
                    </div>
                </div>
            </Modal>
        )}
    </div>
  );
};
