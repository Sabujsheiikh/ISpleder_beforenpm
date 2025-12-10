
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GlobalState, MonthlyRecord, PaymentStatus, ExpenseType, Client, ToastType, InventoryItem, ClientAsset, InventoryTransaction } from '../types';
import { Search, Plus, MoreVertical, Download, Printer, Filter, Edit, Trash2, Check, X, FileText, ArrowRight, Settings, Users, AlertCircle, XCircle, History, ChevronDown, Save, Calendar, Activity, RotateCcw, Wifi, Maximize, Minimize, Upload, FileSpreadsheet, Box, ShoppingCart, FileCheck, ClipboardList, Package, Info, ArrowUp, ArrowDown, UserX, UserMinus } from '../components/ui/Icons';
import { Modal } from '../components/ui/Modal';
import { generateNextMonth } from '../services/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ClientMasterSheetProps {
  state: GlobalState;
  updateState: (newState: GlobalState) => void;
  highlightClientId?: string | null;
  onClearSearch?: () => void;
  addToast?: (type: ToastType, msg: string) => void;
}

export const ClientMasterSheet: React.FC<ClientMasterSheetProps> = ({ state, updateState, highlightClientId, onClearSearch, addToast }) => {
  const [filterArea, setFilterArea] = useState('All');
  const [viewMonth, setViewMonth] = useState(state.currentViewMonth);
  // A. Add 'Paid' to quick filters
  const [quickFilter, setQuickFilter] = useState<'All' | 'Active' | 'Inactive' | 'Unpaid' | 'Paid' | 'Fiber' | 'Cat5'>('All');
  
  // B. Add 'todayPaid' to sort options
  const [sortConfig, setSortConfig] = useState<{ key: 'none' | 'name' | 'joiningDate' | 'todayPaid', direction: 'asc' | 'desc' }>({ key: 'none', direction: 'asc' });

  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isEditRecordOpen, setIsEditRecordOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MonthlyRecord | null>(null);
  
  const [isLeftClientsListOpen, setIsLeftClientsListOpen] = useState(false);

  const [selectedClientForProfile, setSelectedClientForProfile] = useState<MonthlyRecord | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileEditData, setProfileEditData] = useState<Partial<Client> & { overdueMonths?: number, remarks?: string, customFields?: Record<string, string> }>({});
  
  const [isDeleteOptionsOpen, setIsDeleteOptionsOpen] = useState(false);
  const [isGenerateMonthOpen, setIsGenerateMonthOpen] = useState(false);
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
  const [advancedEditData, setAdvancedEditData] = useState<Partial<Client>>({});

  const [isAssignAssetOpen, setIsAssignAssetOpen] = useState(false);
  const [newAssetAssignment, setNewAssetAssignment] = useState<{itemId: string, status: 'Sold' | 'Free' | 'Lent', price: number}>({ itemId: '', status: 'Sold', price: 0 });

  const [newClient, setNewClient] = useState<Partial<Client> & { customFields?: Record<string, string> }>({
    name: '', 
    username: '', 
    contactNumber: '', 
    fullAddress: '', 
    area: '', 
    baseMonthlyFee: 0, 
    isActive: true, 
    clientId: '', 
    customFields: {}, 
    joiningDate: new Date().toISOString().slice(0, 10), 
    lineType: 'Cat5',
    bandwidthPackage: '10 Mbps',
    clientType: 'Home User'
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
     if (highlightClientId) {
        setQuickFilter('All');
        setFilterArea('All');
     }
  }, [highlightClientId]);

  useEffect(() => {
     setLastSelectedId(null);
  }, [filterArea, quickFilter, highlightClientId]);

  const currentMonthRecords = useMemo(() => {
     return state.records.filter(r => r.monthKey === viewMonth);
  }, [state.records, viewMonth]);

  const stats = useMemo(() => {
     return {
        total: currentMonthRecords.length,
        active: currentMonthRecords.filter(r => r.isActive).length,
        inactive: currentMonthRecords.filter(r => !r.isActive).length,
        unpaid: currentMonthRecords.filter(r => r.payableAmount > r.paidAmount).length,
        paid: currentMonthRecords.filter(r => r.paidAmount >= r.payableAmount).length, // Add Paid Count
        fiber: currentMonthRecords.filter(r => r.lineType === 'Fiber').length,
        cat5: currentMonthRecords.filter(r => !r.lineType || r.lineType === 'Cat5').length
     };
  }, [currentMonthRecords]);

  const filteredRecords = useMemo(() => {
    let result = currentMonthRecords.filter(record => {
      const client = state.clients.find(c => c.id === record.clientId);
      if (client?.isArchived) return false;

      const searchTerm = highlightClientId || ''; 
      const matchSearch = 
        record.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.contact.includes(searchTerm) ||
        record.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.displayClientId && record.displayClientId.includes(searchTerm));
      const matchArea = filterArea === 'All' || record.area === filterArea;
      
      let matchStatus = true;
      if (quickFilter === 'Active') matchStatus = record.isActive;
      if (quickFilter === 'Inactive') matchStatus = !record.isActive;
      if (quickFilter === 'Unpaid') matchStatus = record.payableAmount > record.paidAmount;
      if (quickFilter === 'Paid') matchStatus = record.paidAmount >= record.payableAmount; // A. Paid Logic
      if (quickFilter === 'Fiber') matchStatus = record.lineType === 'Fiber';
      if (quickFilter === 'Cat5') matchStatus = (!record.lineType || record.lineType === 'Cat5');

      return matchSearch && matchArea && matchStatus;
    });

    // Sorting Logic
    if (sortConfig.key !== 'none') {
        result.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            if (sortConfig.key === 'name') {
                valA = a.clientName.toLowerCase();
                valB = b.clientName.toLowerCase();
            } else if (sortConfig.key === 'joiningDate') {
                const clientA = state.clients.find(c => c.id === a.clientId);
                const clientB = state.clients.find(c => c.id === b.clientId);
                valA = clientA?.joiningDate || '';
                valB = clientB?.joiningDate || '';
            } else if (sortConfig.key === 'todayPaid') { // B. Today Paid Sort
                const today = new Date().toISOString().slice(0, 10);
                // Priority: Paid Today > Paid Other > Unpaid
                // Using date string comparison directly
                valA = a.paymentDate === today ? 2 : (a.paidAmount > 0 ? 1 : 0);
                valB = b.paymentDate === today ? 2 : (b.paidAmount > 0 ? 1 : 0);
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return result;
  }, [currentMonthRecords, highlightClientId, filterArea, quickFilter, sortConfig, state.clients]);

  const leftClientsList = useMemo(() => {
      return state.clients.filter(c => c.isArchived).sort((a, b) => new Date(b.leftDate || '').getTime() - new Date(a.leftDate || '').getTime());
  }, [state.clients]);

  const uniqueAreas = useMemo(() => {
    return (Array.from(new Set(currentMonthRecords.map(r => r.area))) as string[]).filter(Boolean).sort();
  }, [currentMonthRecords]);

  const totals = useMemo(() => {
    return filteredRecords.reduce((acc, r) => ({
      payable: acc.payable + r.payableAmount,
      paid: acc.paid + r.paidAmount,
      due: acc.due + (r.payableAmount - r.paidAmount)
    }), { payable: 0, paid: 0, due: 0 });
  }, [filteredRecords]);

  const clientHistory = useMemo(() => {
    if(!selectedClientForProfile) return [];
    return state.records
      .filter(r => r.clientId === selectedClientForProfile.clientId)
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); 
  }, [selectedClientForProfile, state.records]);

  const clientHistoryTotals = useMemo(() => {
     return clientHistory.reduce((acc, r) => ({
        payable: acc.payable + r.payableAmount,
        paid: acc.paid + r.paidAmount,
        due: acc.due + (r.payableAmount - r.paidAmount)
     }), { payable: 0, paid: 0, due: 0});
  }, [clientHistory]);

  const fullClientDetails = useMemo(() => {
     if (!selectedClientForProfile) return null;
     return state.clients.find(c => c.id === selectedClientForProfile.clientId);
  }, [selectedClientForProfile, state.clients]);

  const handleRowClick = (e: React.MouseEvent, record: MonthlyRecord) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('.no-click')) return;
    
    if (e.shiftKey && lastSelectedId) {
        const start = filteredRecords.findIndex(r => r.id === lastSelectedId);
        const end = filteredRecords.findIndex(r => r.id === record.id);
        if (start !== -1 && end !== -1) {
            const low = Math.min(start, end);
            const high = Math.max(start, end);
            const newSelection = new Set(selectedIds);
            for (let i = low; i <= high; i++) newSelection.add(filteredRecords[i].id);
            setSelectedIds(newSelection);
        }
        return;
    }
    
    if (e.ctrlKey || e.metaKey) {
        toggleSelection(record.id);
        setLastSelectedId(record.id);
        return;
    }

    const client = state.clients.find(c => c.id === record.clientId);
    setSelectedClientForProfile(record);
    if (client) {
        setProfileEditData({
            name: client.name,
            username: client.username,
            contactNumber: client.contactNumber,
            fullAddress: client.fullAddress,
            area: client.area,
            lineType: client.lineType,
            bandwidthPackage: client.bandwidthPackage || '10 Mbps',
            clientType: client.clientType || 'Home User',
            joiningDate: client.joiningDate || '',
            isActive: client.isActive,
            baseMonthlyFee: client.baseMonthlyFee,
            overdueMonths: record.overdueMonths,
            remarks: record.remarks,
            customFields: client.customFields
        });
    }
    setIsEditingProfile(false);
    setIsAssignAssetOpen(false); 
    setIsProfileOpen(true);
  };

  const handleBulkMarkPaid = () => {
      if(!confirm(`Mark ${selectedIds.size} clients as fully PAID? This will update their paid amount to match payable.`)) return;
      
      const today = new Date().toISOString().slice(0, 10);
      const updatedRecords = state.records.map(r => {
          if (selectedIds.has(r.id)) {
              return { ...r, paidAmount: r.payableAmount, status: PaymentStatus.PAID, paymentDate: today };
          }
          return r;
      });

      const newExpenses = [...state.expenses];
      const selectedRecords = state.records.filter(r => selectedIds.has(r.id));
      
      selectedRecords.forEach(r => {
           const paidDiff = r.payableAmount - r.paidAmount; 
           if (paidDiff > 0) {
               const description = `Daily Collection - ${today}`;
               const existingIndex = newExpenses.findIndex(e => e.description === description && e.type === ExpenseType.CREDIT);
               if (existingIndex >= 0) {
                  newExpenses[existingIndex] = { ...newExpenses[existingIndex], amount: newExpenses[existingIndex].amount + paidDiff };
               } else {
                  newExpenses.push({ id: crypto.randomUUID(), date: today, description: description, amount: paidDiff, type: ExpenseType.CREDIT });
               }
           }
      });

      updateState({ ...state, records: updatedRecords, expenses: newExpenses });
      setSelectedIds(new Set());
      if(addToast) addToast('success', 'Bulk payment updated successfully');
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleAssignAsset = () => {
      if (!selectedClientForProfile || !newAssetAssignment.itemId) return;
      
      const item = state.inventory.find(i => i.id === newAssetAssignment.itemId);
      if (!item || item.stockCount <= 0) {
          if(addToast) addToast('error', 'Item out of stock or invalid');
          return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const updatedInventory = state.inventory.map(i => i.id === item.id ? { ...i, stockCount: i.stockCount - 1 } : i);
      
      const newAsset: ClientAsset = {
          id: crypto.randomUUID(),
          inventoryItemId: item.id,
          name: item.name,
          assignedDate: today,
          status: newAssetAssignment.status as 'Sold' | 'Lent' | 'Free',
          priceCharged: newAssetAssignment.status === 'Sold' ? newAssetAssignment.price : 0
      };

      const updatedClients = state.clients.map(c => {
          if (c.id === selectedClientForProfile.clientId) {
              return { ...c, assignedAssets: [...(c.assignedAssets || []), newAsset] };
          }
          return c;
      });

      let updatedExpenses = [...state.expenses];
      if (newAssetAssignment.status === 'Sold' && newAssetAssignment.price > 0) {
           updatedExpenses.push({
               id: crypto.randomUUID(),
               date: today,
               description: `Sold ${item.name} to ${selectedClientForProfile.clientName}`,
               amount: newAssetAssignment.price,
               type: ExpenseType.CREDIT,
               category: 'Hardware Sales'
           });
      }

      // LOG TO HISTORY
      const newHistory = [...(state.inventoryHistory || [])];
      newHistory.push({
          id: crypto.randomUUID(),
          date: today,
          itemId: item.id,
          itemName: item.name,
          type: 'Assign',
          quantity: 1,
          clientId: selectedClientForProfile.clientId,
          clientName: selectedClientForProfile.clientName,
          remarks: `Status: ${newAssetAssignment.status}`
      });

      updateState({ ...state, inventory: updatedInventory, clients: updatedClients, expenses: updatedExpenses, inventoryHistory: newHistory });
      setIsAssignAssetOpen(false);
      setNewAssetAssignment({ itemId: '', status: 'Sold', price: 0 });
      if(addToast) addToast('success', 'Asset assigned successfully');
  };

  const handleReturnAsset = (assetId: string, itemId: string) => {
      if (!selectedClientForProfile || !confirm("Mark asset as returned? This will add +1 to stock.")) return;
      const item = state.inventory.find(i => i.id === itemId);
      const updatedInventory = state.inventory.map(i => i.id === itemId ? { ...i, stockCount: i.stockCount + 1 } : i);
      const updatedClients = state.clients.map(c => {
          if (c.id === selectedClientForProfile.clientId) {
              return { ...c, assignedAssets: c.assignedAssets?.filter(a => a.id !== assetId) };
          }
          return c;
      });

      // LOG TO HISTORY
      const newHistory = [...(state.inventoryHistory || [])];
      newHistory.push({
          id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
          itemId: itemId,
          itemName: item ? item.name : 'Unknown Item',
          type: 'Return',
          quantity: 1,
          clientId: selectedClientForProfile.clientId,
          clientName: selectedClientForProfile.clientName,
          remarks: 'Returned from client'
      });

      updateState({ ...state, inventory: updatedInventory, clients: updatedClients, inventoryHistory: newHistory });
      if(addToast) addToast('info', 'Asset returned to stock');
  };

  const handleSaveProfile = () => {
     if (!selectedClientForProfile || !fullClientDetails) return;

     const newFee = profileEditData.baseMonthlyFee !== undefined ? profileEditData.baseMonthlyFee : fullClientDetails.baseMonthlyFee;
     const newOverdue = profileEditData.overdueMonths !== undefined ? profileEditData.overdueMonths : selectedClientForProfile.overdueMonths;
     const calculatedPayable = newFee * (newOverdue || 0);

     const updatedClients = state.clients.map(c => {
        if (c.id === fullClientDetails.id) {
            return {
                ...c,
                name: profileEditData.name || c.name,
                username: profileEditData.username || c.username,
                contactNumber: profileEditData.contactNumber || c.contactNumber,
                fullAddress: profileEditData.fullAddress || c.fullAddress,
                area: profileEditData.area || c.area,
                lineType: profileEditData.lineType || c.lineType,
                bandwidthPackage: profileEditData.bandwidthPackage || c.bandwidthPackage,
                clientType: profileEditData.clientType || c.clientType,
                joiningDate: profileEditData.joiningDate,
                isActive: profileEditData.isActive ?? c.isActive,
                baseMonthlyFee: newFee,
                customFields: profileEditData.customFields || c.customFields
            };
        }
        return c;
     });

     const updatedRecords = state.records.map(r => {
        if (r.id === selectedClientForProfile.id) {
             return {
                 ...r,
                 clientName: profileEditData.name || r.clientName,
                 username: profileEditData.username || r.username,
                 contact: profileEditData.contactNumber || r.contact,
                 address: profileEditData.fullAddress || r.address,
                 area: profileEditData.area || r.area,
                 lineType: profileEditData.lineType || r.lineType,
                 bandwidthPackage: profileEditData.bandwidthPackage || r.bandwidthPackage,
                 clientType: profileEditData.clientType || r.clientType,
                 isActive: profileEditData.isActive ?? r.isActive,
                 payableAmount: calculatedPayable > 0 ? calculatedPayable : r.payableAmount, 
                 overdueMonths: newOverdue,
                 remarks: profileEditData.remarks || r.remarks,
                 customFields: profileEditData.customFields || r.customFields
             };
        }
        if (r.clientId === fullClientDetails.id) {
            return {
                ...r,
                clientName: profileEditData.name || r.clientName,
                username: profileEditData.username || r.username,
                contact: profileEditData.contactNumber || r.contact,
                address: profileEditData.fullAddress || r.address,
                area: profileEditData.area || r.area,
                lineType: profileEditData.lineType || r.lineType,
                bandwidthPackage: profileEditData.bandwidthPackage || r.bandwidthPackage,
                clientType: profileEditData.clientType || r.clientType,
                isActive: profileEditData.isActive ?? r.isActive
            };
        }
        return r;
     });

     updateState({ ...state, clients: updatedClients, records: updatedRecords });
     if (profileEditData.name) selectedClientForProfile.clientName = profileEditData.name; 
     setIsEditingProfile(false);
     if(addToast) addToast('success', 'Client profile updated successfully');
  };

  const handlePrintProfile = () => {
    if (!selectedClientForProfile || !fullClientDetails) return;
    if(addToast) addToast('info', 'Generating profile for print...');
    
    try {
        const win = window.open('', '_blank', 'width=900,height=800,toolbar=0,scrollbars=1,status=0');
        if (!win) {
            if(addToast) addToast('error', 'Pop-up blocked. Please allow pop-ups.');
            return;
        }

        const companyName = state.settings.companyName;
        const companyTagline = state.settings.companyTagline || '';
        const companyAddress = state.settings.companyAddress || '';

        const historyRows = clientHistory.map(r => `
        <tr>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${r.monthKey}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right;">${r.payableAmount}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right;">${r.paidAmount}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right; font-weight:bold; color:${(r.payableAmount - r.paidAmount) > 0 ? '#ef4444' : '#10b981'};">${r.payableAmount - r.paidAmount}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:center;">${r.status}</td>
            <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${r.receiptNo || '-'}</td>
        </tr>
        `).join('');

        const content = `
        <html>
            <head>
            <title>Client Profile - ${fullClientDetails.name}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
                body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #1f2937; line-height: 1.5; background: white; -webkit-print-color-adjust: exact; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; }
                .company-name { font-size: 28px; font-weight: 900; color: #111827; margin: 0; text-transform: uppercase; }
                .tagline { font-size: 12px; color: #6b7280; letter-spacing: 1px; text-transform: uppercase; margin-top: 5px; }
                .address { font-size: 11px; color: #6b7280; margin-top: 5px; }
                
                .client-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; background: #f9fafb; padding: 25px; border-radius: 12px; border: 1px solid #e5e7eb; }
                .info-item { margin-bottom: 12px; }
                .label { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 700; display: block; margin-bottom: 3px; letter-spacing: 0.5px; }
                .value { font-size: 15px; font-weight: 600; color: #1f2937; }
                
                .stats-box { display: flex; gap: 20px; margin-bottom: 30px; }
                .stat { flex: 1; padding: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 700; }
                .stat-val { font-size: 24px; font-weight: 900; margin-top: 5px; }
                
                table { w-full; width: 100%; border-collapse: collapse; font-size: 13px; }
                th { text-align: left; padding: 12px 8px; background: #f3f4f6; color: #4b5563; font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
                td { color: #374151; }
                
                .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                .signature { margin-top: 80px; display: flex; justify-content: space-between; }
                .sign-line { width: 200px; border-top: 1px solid #d1d5db; text-align: center; padding-top: 5px; font-size: 11px; font-weight: 600; color: #4b5563; }
                
                @media print {
                    body { padding: 20px; }
                    .client-info { background-color: #f9fafb !important; -webkit-print-color-adjust: exact; }
                    th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
                }
            </style>
            </head>
            <body>
            <div class="header">
                <h1 class="company-name">${companyName}</h1>
                <div class="tagline">${companyTagline}</div>
                <div class="address">${companyAddress}</div>
            </div>
            
            <h2 style="font-size:18px; margin-bottom:20px; border-left:4px solid #3b82f6; padding-left:15px; color:#1f2937;">Client Profile Summary</h2>
            
            <div class="client-info">
                <div class="info-item"><span class="label">Client Name</span><span class="value">${fullClientDetails.name}</span></div>
                <div class="info-item"><span class="label">Client ID</span><span class="value" style="font-family:monospace">${fullClientDetails.clientId}</span></div>
                <div class="info-item"><span class="label">Username</span><span class="value">${fullClientDetails.username}</span></div>
                <div class="info-item"><span class="label">Contact</span><span class="value">${fullClientDetails.contactNumber}</span></div>
                <div class="info-item"><span class="label">Area</span><span class="value">${fullClientDetails.area}</span></div>
                <div class="info-item"><span class="label">Address</span><span class="value">${fullClientDetails.fullAddress}</span></div>
                <div class="info-item"><span class="label">Client Type</span><span class="value">${fullClientDetails.clientType || 'Home User'}</span></div>
                <div class="info-item"><span class="label">Connection Type</span><span class="value">${fullClientDetails.lineType} (${fullClientDetails.bandwidthPackage})</span></div>
                <div class="info-item"><span class="label">Monthly Fee</span><span class="value">${state.settings.currencySymbol}${fullClientDetails.baseMonthlyFee}</span></div>
                <div class="info-item"><span class="label">Status</span><span class="value" style="color:${fullClientDetails.isActive ? '#10b981' : '#ef4444'}">${fullClientDetails.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div>
                <div class="info-item"><span class="label">Join Date</span><span class="value">${fullClientDetails.joiningDate || 'N/A'}</span></div>
            </div>

            <div class="stats-box">
                <div class="stat">
                    <div class="stat-label">Total Paid (Lifetime)</div>
                    <div class="stat-val" style="color:#10b981;">${state.settings.currencySymbol}${clientHistoryTotals.paid.toLocaleString()}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Current Outstanding</div>
                    <div class="stat-val" style="color:#ef4444;">${state.settings.currencySymbol}${clientHistoryTotals.due.toLocaleString()}</div>
                </div>
            </div>

            <h3 style="font-size:14px; margin-bottom:15px; margin-top:30px; font-weight:700; color:#4b5563;">Transaction History</h3>
            <table>
                <thead>
                    <tr>
                    <th>Month</th>
                    <th style="text-align:right;">Bill Amount</th>
                    <th style="text-align:right;">Paid Amount</th>
                    <th style="text-align:right;">Due</th>
                    <th style="text-align:center;">Status</th>
                    <th>Receipt Ref</th>
                    </tr>
                </thead>
                <tbody>
                    ${historyRows}
                </tbody>
            </table>
            
            <div class="signature">
                <div class="sign-line">Client Signature</div>
                <div class="sign-line">Authorized Signature</div>
            </div>

            <div class="footer">
                <p>Document generated by ${state.settings.userName || 'System'} via ISPLedger | ${new Date().toLocaleDateString()}</p>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
            </body>
        </html>
        `;
        
        win.document.write(content);
        win.document.close();
    } catch (e) {
        console.error("Print failed", e);
        if(addToast) addToast('error', 'Print failed. Check console.');
    }
  };

  const handleOpenEdit = (record: MonthlyRecord) => {
     setSelectedRecord(record);
     setShowAdvancedEdit(false); 
     const client = state.clients.find(c => c.id === record.clientId);
     if (client) {
        setAdvancedEditData({
           name: client.name,
           contactNumber: client.contactNumber,
           fullAddress: client.fullAddress,
           area: client.area,
           lineType: client.lineType,
           bandwidthPackage: client.bandwidthPackage,
           clientType: client.clientType,
           isActive: client.isActive
        });
     } else {
        setAdvancedEditData({
           name: record.clientName,
           contactNumber: record.contact,
           fullAddress: record.address,
           area: record.area,
           lineType: record.lineType,
           bandwidthPackage: record.bandwidthPackage,
           clientType: record.clientType,
           isActive: record.isActive
        });
     }
     setIsEditRecordOpen(true);
  };
  
  const handleAddClient = () => {
      if (!newClient.name || !newClient.username) return;
      const clientId = crypto.randomUUID();
      const client: Client = {
        id: clientId,
        clientId: newClient.clientId || '',
        username: newClient.username!,
        name: newClient.name!,
        contactNumber: newClient.contactNumber || '',
        fullAddress: newClient.fullAddress || '',
        area: newClient.area || 'General',
        lineType: newClient.lineType || 'Cat5',
        bandwidthPackage: newClient.bandwidthPackage || '10 Mbps',
        clientType: newClient.clientType || 'Home User',
        isActive: true,
        baseMonthlyFee: Number(newClient.baseMonthlyFee) || 0,
        customFields: newClient.customFields || {},
        joiningDate: newClient.joiningDate || new Date().toISOString().slice(0, 10),
        assignedAssets: []
      };
      const newRecords = [...state.records];
      newRecords.push({
          id: crypto.randomUUID(),
          clientId: client.id,
          displayClientId: client.clientId,
          monthKey: viewMonth,
          clientName: client.name,
          username: client.username,
          area: client.area,
          lineType: client.lineType,
          bandwidthPackage: client.bandwidthPackage,
          clientType: client.clientType,
          contact: client.contactNumber,
          address: client.fullAddress,
          isActive: client.isActive,
          billDate: new Date().toISOString(),
          payableAmount: client.baseMonthlyFee,
          paidAmount: 0,
          status: PaymentStatus.UNPAID,
          overdueMonths: 0,
          remarks: 'New Client',
          paymentDate: '',
          receiptNo: '',
          customFields: client.customFields
      });
      updateState({...state, clients: [...state.clients, client], records: newRecords});
      setIsAddClientOpen(false);
      setNewClient({ name: '', username: '', contactNumber: '', fullAddress: '', area: '', baseMonthlyFee: 0, isActive: true, clientId: '', customFields: {}, joiningDate: new Date().toISOString().slice(0, 10), lineType: 'Cat5', bandwidthPackage: '10 Mbps', clientType: 'Home User' });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];

        if (jsonData.length === 0) {
            if(addToast) addToast('error', 'Excel file is empty');
            return;
        }

        const newClients: Client[] = [];
        const newRecords: MonthlyRecord[] = [];
        let importedCount = 0;
        let skippedCount = 0;

        // Clone current state arrays to check for duplicates
        const existingUsernames = new Set(state.clients.map(c => c.username.toLowerCase()));

        jsonData.forEach((row: any) => {
            // Flexible Header Mapping
            const name = row['Name'] || row['Client Name'] || row['name'];
            const username = row['Username'] || row['User ID'] || row['username'];
            
            // Basic validation
            if (!name || !username) {
                skippedCount++;
                return;
            }

            // Duplicate Check
            if (existingUsernames.has(String(username).toLowerCase())) {
                skippedCount++;
                return;
            }

            const clientId = crypto.randomUUID();
            const joiningDate = new Date().toISOString().slice(0, 10);
            const fee = Number(row['Fee'] || row['Monthly Fee'] || row['Bill'] || 0);

            // Create Client
            const newClient: Client = {
                id: clientId,
                clientId: generateShortId(),
                name: String(name),
                username: String(username),
                contactNumber: String(row['Contact'] || row['Phone'] || row['Mobile'] || ''),
                fullAddress: String(row['Address'] || row['Full Address'] || ''),
                area: String(row['Area'] || row['Zone'] || 'General'),
                lineType: String(row['Line Type'] || 'Cat5'),
                bandwidthPackage: String(row['Package'] || '10 Mbps'),
                clientType: String(row['Type'] || 'Home User'),
                isActive: true,
                baseMonthlyFee: fee,
                joiningDate: joiningDate,
                assignedAssets: []
            };

            // Create Record for Current Month
            const newRecord: MonthlyRecord = {
                id: crypto.randomUUID(),
                clientId: clientId,
                displayClientId: newClient.clientId,
                monthKey: viewMonth,
                clientName: newClient.name,
                username: newClient.username,
                area: newClient.area,
                lineType: newClient.lineType,
                bandwidthPackage: newClient.bandwidthPackage,
                clientType: newClient.clientType,
                contact: newClient.contactNumber,
                address: newClient.fullAddress,
                isActive: true,
                billDate: new Date().toISOString(),
                payableAmount: fee,
                paidAmount: 0,
                status: PaymentStatus.UNPAID,
                overdueMonths: 0,
                paymentDate: '',
                receiptNo: '',
                remarks: 'Imported from Excel'
            };

            newClients.push(newClient);
            newRecords.push(newRecord);
            existingUsernames.add(String(username).toLowerCase());
            importedCount++;
        });

        if (importedCount > 0) {
            updateState({
                ...state,
                clients: [...state.clients, ...newClients],
                records: [...state.records, ...newRecords]
            });
            if(addToast) addToast('success', `Imported ${importedCount} clients successfully. ${skippedCount > 0 ? `(${skippedCount} skipped/duplicates)` : ''}`);
        } else {
            if(addToast) addToast('warning', 'No valid new clients found in file.');
        }

    } catch (err) {
        console.error("Excel Import Error:", err);
        if(addToast) addToast('error', 'Failed to read Excel file. Ensure valid .xlsx format.');
    }

    e.target.value = '';
    setIsMenuOpen(false);
  };
  
  const handleUpdateRecord = (updated: MonthlyRecord) => {
      const oldRecord = state.records.find(r => r.id === updated.id);
      let newExpenses = [...state.expenses];
      let updatedClients = [...state.clients];
      if (oldRecord) {
        const paidDiff = updated.paidAmount - oldRecord.paidAmount;
        if (paidDiff !== 0) {
           const transactionDate = updated.paymentDate || new Date().toISOString().split('T')[0];
           const description = `Daily Collection - ${transactionDate}`;
           const existingIndex = newExpenses.findIndex(e => e.description === description && e.type === ExpenseType.CREDIT);
           if (existingIndex >= 0) {
              newExpenses[existingIndex] = { ...newExpenses[existingIndex], amount: newExpenses[existingIndex].amount + paidDiff };
           } else {
              newExpenses.push({ id: crypto.randomUUID(), date: transactionDate, description: description, amount: paidDiff, type: ExpenseType.CREDIT });
           }
        }
      }
      const clientIndex = updatedClients.findIndex(c => c.id === updated.clientId);
      if (clientIndex >= 0) {
         updatedClients[clientIndex] = { ...updatedClients[clientIndex], isActive: updated.isActive };
      }
      if (showAdvancedEdit) {
         updated.clientName = advancedEditData.name || updated.clientName;
         if (clientIndex >= 0) {
            updatedClients[clientIndex] = { ...updatedClients[clientIndex], name: advancedEditData.name || updatedClients[clientIndex].name, area: advancedEditData.area || updatedClients[clientIndex].area, lineType: advancedEditData.lineType || updatedClients[clientIndex].lineType, clientType: advancedEditData.clientType || updatedClients[clientIndex].clientType, bandwidthPackage: advancedEditData.bandwidthPackage || updatedClients[clientIndex].bandwidthPackage };
         }
      }
      const updatedRecords = state.records.map(r => r.id === updated.id ? updated : r);
      updateState({ ...state, clients: updatedClients, records: updatedRecords, expenses: newExpenses });
      setIsEditRecordOpen(false);
      setSelectedRecord(null);
  };
  
  const handleDeleteRecord = (id: string) => {
       const recordToDelete = state.records.find(r => r.id === id);
       let newExpenses = [...state.expenses];
       if (recordToDelete && recordToDelete.paidAmount > 0) {
           const transactionDate = recordToDelete.paymentDate || new Date().toISOString().split('T')[0];
           const description = `Daily Collection - ${transactionDate}`;
           const idx = newExpenses.findIndex(e => e.description === description && e.type === ExpenseType.CREDIT);
           if (idx >= 0) newExpenses[idx] = { ...newExpenses[idx], amount: newExpenses[idx].amount - recordToDelete.paidAmount };
       }
       updateState({ ...state, records: state.records.filter(r => r.id !== id), expenses: newExpenses });
  };
  
  const handleBulkDelete = () => {
       if (selectedIds.size === 0) return;
       if (confirm(`Delete ${selectedIds.size} records?`)) {
          let newExpenses = [...state.expenses];
          selectedIds.forEach(id => {
             const record = state.records.find(r => r.id === id);
             if (record && record.paidAmount > 0) {
                const transactionDate = record.paymentDate || new Date().toISOString().split('T')[0];
                const description = `Daily Collection - ${transactionDate}`;
                const idx = newExpenses.findIndex(e => e.description === description && e.type === ExpenseType.CREDIT);
                if (idx >= 0) newExpenses[idx] = { ...newExpenses[idx], amount: newExpenses[idx].amount - record.paidAmount };
             }
          });
          updateState({ ...state, records: state.records.filter(r => !selectedIds.has(r.id)), expenses: newExpenses });
          setSelectedIds(new Set());
       }
  };
  
  const handleGenerateNextMonth = () => {
       try {
          const [y, m] = viewMonth.split('-').map(Number);
          const nextDate = new Date(y, m);
          const nextMonthKey = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0');
          const newState = generateNextMonth(state, nextMonthKey);
          updateState(newState);
          setViewMonth(nextMonthKey);
          setIsGenerateMonthOpen(false);
      } catch(e: any) { console.error(e); }
  };
  
  const generateShortId = () => Math.floor(1000 + Math.random() * 9000).toString();

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredRecords.map(r => ({
        'Client ID': r.displayClientId,
        'Name': r.clientName,
        'Username': r.username,
        'Area': r.area,
        'Type': r.clientType,
        'Contact': r.contact,
        'Payable': r.payableAmount,
        'Paid': r.paidAmount,
        'Status': r.status
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.writeFile(wb, `Clients_${viewMonth}.xlsx`);
    setIsMenuOpen(false);
  };

  const handleMarkAsLeft = () => {
      if (!selectedClientForProfile || !fullClientDetails) return;
      
      const clientIndex = state.clients.findIndex(c => c.id === fullClientDetails.id);
      if (clientIndex === -1) return;

      const newClients = [...state.clients];
      newClients[clientIndex] = {
          ...newClients[clientIndex],
          isActive: false,
          isArchived: true,
          leftDate: new Date().toISOString().slice(0, 10)
      };

      const newRecords = state.records.map(r => {
          if (r.clientId === fullClientDetails.id && r.monthKey >= viewMonth) { 
               return { ...r, isActive: false, remarks: r.remarks ? r.remarks + ' (Left)' : 'Left' };
          }
          return r;
      });

      updateState({
          ...state,
          clients: newClients,
          records: newRecords
      });

      setIsDeleteOptionsOpen(false);
      setIsProfileOpen(false);
      if(addToast) addToast('info', 'Client marked as Left (Archived).');
  };

  const handlePermanentDelete = () => {
      if (!fullClientDetails) return;
      if (!confirm(`Permanently delete ${fullClientDetails.name}? This will remove ALL history and cannot be undone.`)) return;
      
      const newClients = state.clients.filter(c => c.id !== fullClientDetails.id);
      const newRecords = state.records.filter(r => r.clientId !== fullClientDetails.id);
      
      updateState({ ...state, clients: newClients, records: newRecords });
      setIsDeleteOptionsOpen(false);
      setIsProfileOpen(false);
      if(addToast) addToast('success', 'Client and history deleted permanently.');
  };

  const handleRestoreClient = (client: Client) => {
      if (!confirm(`Restore ${client.name}? They will reappear in the list.`)) return;
      
      const updatedClients = state.clients.map(c => 
          c.id === client.id ? { ...c, isArchived: false, isActive: true, leftDate: undefined } : c
      );
      
      const updatedRecords = state.records.map(r => 
          r.clientId === client.id && r.monthKey === viewMonth 
            ? { ...r, isActive: true, remarks: 'Restored' } 
            : r
      );

      updateState({ ...state, clients: updatedClients, records: updatedRecords });
      if(addToast) addToast('success', 'Client restored successfully.');
  };

  const renderCell = (key: string, record: MonthlyRecord, index: number, textColorClass: string) => {
     if (state.settings.dynamicFields?.includes(key)) {
         return record.customFields ? record.customFields[key] || '-' : '-';
     }
     const client = state.clients.find(c => c.id === record.clientId);
     const baseFee = client?.baseMonthlyFee || 0;
     const hasLentItems = client?.assignedAssets?.some(a => a.status === 'Lent');
     const lentItemName = hasLentItems ? client?.assignedAssets?.find(a => a.status === 'Lent')?.name : '';

     switch(key) {
       case 'slNo': return <span className="text-gray-400 font-mono text-[11px]">{index + 1}</span>;
       case 'displayClientId': return <span className={`font-mono text-xs ${textColorClass}`}>{record.displayClientId}</span>;
       case 'username': return <span className={`font-mono text-xs ${textColorClass} px-2 py-0.5 rounded border border-gray-100 dark:border-gray-700 font-semibold bg-gray-50/50 dark:bg-gray-800`}>{record.username}</span>;
       case 'name': return (
            <div className="flex items-center gap-1">
                <span className={`font-semibold tracking-tight text-xs ${textColorClass}`}>{record.clientName}</span>
                {hasLentItems && (
                    <div className="group relative">
                        <Package size={14} className="text-orange-500" />
                        <span className="absolute left-4 top-0 bg-gray-900 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none transition-opacity">
                            Lent: {lentItemName}
                        </span>
                    </div>
                )}
            </div>
       );
       case 'isActive': return record.isActive 
         ? <span className="text-green-500 bg-green-50 dark:bg-green-900/30 p-1 rounded-full inline-block"><Check size={12}/></span> 
         : <span className="text-red-500 bg-red-50 dark:bg-red-900/30 p-1 rounded-full inline-block"><X size={12}/></span>;
       case 'clientType': return <span className={`text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded font-medium`}>{record.clientType || 'Home User'}</span>;
       case 'lineType': return <span className={`text-[10px] font-bold uppercase ${textColorClass}`}>{record.lineType || 'Cat5'}</span>;
       case 'bandwidthPackage': return <span className={`font-mono text-[10px] ${textColorClass} opacity-80`}>{record.bandwidthPackage || '10 Mbps'}</span>;
       case 'contact': return <span className={`text-xs font-mono tracking-tighter ${textColorClass}`}>{record.contact}</span>;
       case 'address': return <span title={record.address} className={`truncate max-w-[150px] block text-[11px] ${textColorClass} opacity-80`}>{record.address}</span>;
       case 'area': return <span className={`text-[11px] bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-100 dark:border-gray-700 ${textColorClass}`}>{record.area}</span>;
       case 'monthKey': return <span className="text-[10px] text-gray-400">{record.monthKey}</span>;
       case 'paymentDate': return record.paymentDate ? <span className={`text-[10px] whitespace-nowrap ${textColorClass}`}>{new Date(record.paymentDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span> : <span className="text-gray-300">-</span>;
       case 'payable': 
          const prevDue = record.payableAmount - baseFee;
          if (prevDue > 0 && baseFee > 0) {
              return (
                  <div className="flex flex-col leading-none">
                      <span className={`font-bold text-sm ${textColorClass}`}>{record.payableAmount}</span>
                      <span className="text-[9px] text-red-500 font-bold block mt-0.5">+{prevDue} Prev Due</span>
                  </div>
              )
          }
          return <span className={`font-bold text-sm ${textColorClass}`}>{record.payableAmount}</span>;
       case 'paid': return record.paidAmount > 0 ? <span className="font-bold text-green-600 text-sm">+{record.paidAmount}</span> : <span className="text-gray-300 text-sm">0</span>;
       case 'status': 
          return (
            <span className={`text-[10px] uppercase font-bold ${
                record.status === 'Paid' ? 'text-green-600' : 
                record.status === 'Partial' ? 'text-yellow-600' : 'text-red-600'
            }`}>
                {record.status}
            </span>
          );
       case 'receiptNo': return record.receiptNo ? <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">#{record.receiptNo}</span> : '-';
       case 'overdue': return record.overdueMonths > 0 ? <span className="text-red-600 font-bold bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded text-[10px]">{record.overdueMonths} Mo</span> : <span className="text-gray-300">-</span>;
       case 'remarks': return record.remarks ? <span className={`text-[10px] italic max-w-[100px] truncate block ${textColorClass}`} title={record.remarks}>{record.remarks}</span> : '-';
       default: return '';
     }
  };

  const CompactFilterPill = ({ label, count, active, onClick }: any) => (
    <button 
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all duration-200 border whitespace-nowrap ${
        active 
          ? `bg-gray-800 text-white dark:bg-white dark:text-gray-900 border-transparent shadow-sm` 
          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300'
      }`}
    >
      <span>{label}</span>
      <span className={`px-1.5 rounded bg-opacity-20 text-[10px] min-w-[18px] text-center ${active ? 'bg-white/20 text-white dark:text-gray-900' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>{count}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 shadow-sm rounded-xl border border-gray-200 dark:border-gray-800 animate-fade-in relative print:shadow-none print:border-none">
      
      <div className="hidden print-header">
          <h1 className="print-header-company">{state.settings.companyName}</h1>
          <p className="print-header-title">Client Master List</p>
          <p className="print-header-meta">For Month: {viewMonth} | Generated on {new Date().toLocaleString()}</p>
      </div>

      {/* Top Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-2 shrink-0 z-40 rounded-t-xl print:hidden">
         <div className="flex flex-wrap items-center justify-between gap-2">
             <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar no-scrollbar-buttons max-w-full md:max-w-3xl pr-2">
                <CompactFilterPill label="All" count={stats.total} active={quickFilter === 'All'} onClick={() => { setQuickFilter('All'); if(onClearSearch) onClearSearch(); }} />
                <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-0.5"></div>
                <CompactFilterPill label="Unpaid" count={stats.unpaid} active={quickFilter === 'Unpaid'} onClick={() => setQuickFilter('Unpaid')} />
                <CompactFilterPill label="Paid" count={stats.paid} active={quickFilter === 'Paid'} onClick={() => setQuickFilter('Paid')} />
                <CompactFilterPill label="Active" count={stats.active} active={quickFilter === 'Active'} onClick={() => setQuickFilter('Active')} />
                <CompactFilterPill label="Inactive" count={stats.inactive} active={quickFilter === 'Inactive'} onClick={() => setQuickFilter('Inactive')} />
                <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-0.5"></div>
                <CompactFilterPill label="Fiber" count={stats.fiber} active={quickFilter === 'Fiber'} onClick={() => setQuickFilter('Fiber')} />
                <CompactFilterPill label="Cat5" count={stats.cat5} active={quickFilter === 'Cat5'} onClick={() => setQuickFilter('Cat5')} />
                
                {selectedIds.size > 0 && (
                    <button 
                    onClick={handleBulkDelete}
                    className="ml-2 bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded flex items-center gap-1 text-[11px] font-bold border border-red-200 transition-colors animate-scale-in"
                    >
                    <Trash2 size={12} /> Delete ({selectedIds.size})
                    </button>
                )}
             </div>

            <div className="flex items-center gap-2 ml-auto">
                 <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <select 
                        value={sortConfig.key} 
                        onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value as any })}
                        className="pl-2 pr-1 py-1.5 text-xs bg-transparent border-none focus:ring-0 outline-none dark:text-white font-medium max-w-[130px]"
                    >
                        <option value="none">Sort: None</option>
                        <option value="name">Sort: Name</option>
                        <option value="joiningDate">Sort: Joined</option>
                        <option value="todayPaid">Sort: Paid Today</option>
                    </select>
                    {sortConfig.key !== 'none' && (
                        <button 
                            onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                            className="p-1.5 hover:bg-white dark:hover:bg-gray-700 text-gray-500 rounded transition-all"
                        >
                            {sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        </button>
                    )}
                 </div>

                 <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <input 
                        type="month" 
                        value={viewMonth} 
                        onChange={(e) => setViewMonth(e.target.value)}
                        className="pl-2 pr-1 py-1.5 text-xs bg-transparent border-none focus:ring-0 outline-none dark:text-white w-28 font-medium"
                    />
                    <button 
                        onClick={() => setIsGenerateMonthOpen(true)}
                        className="p-1.5 hover:bg-white dark:hover:bg-gray-700 text-brand-600 rounded shadow-sm transition-all"
                        title="Generate Next Month"
                    >
                        <Plus size={14} />
                    </button>
                 </div>

                 <select 
                    value={filterArea} 
                    onChange={(e) => setFilterArea(e.target.value)}
                    className="pl-2 pr-6 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white outline-none focus:border-brand-500 hover:border-gray-300 transition-colors max-w-[130px]"
                 >
                    <option value="All">All Areas</option>
                    {uniqueAreas.map((area: string) => <option key={area} value={area}>{area}</option>)}
                 </select>

                 <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block"></div>
                 
                 <div className="relative" ref={menuRef}>
                    <button 
                       onClick={() => setIsMenuOpen(!isMenuOpen)}
                       className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                    >
                       <MoreVertical size={16} />
                    </button>
                    {isMenuOpen && (
                       <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-scale-in origin-top-right">
                          <label className="flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                             <Upload size={14} /> Import Excel
                             <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
                          </label>
                          <button onClick={exportToExcel} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                             <FileSpreadsheet size={14} /> Export Excel
                          </button>
                          <button onClick={() => { window.print(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                             <Printer size={14} /> Print List
                          </button>
                          
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                          <button onClick={() => { setIsLeftClientsListOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left font-bold">
                             <UserX size={14} /> View Left Clients
                          </button>
                       </div>
                    )}
                 </div>

                 <button 
                    onClick={() => setIsAddClientOpen(true)}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold shadow-md shadow-brand-500/20 transition-all transform hover:scale-105 ml-1"
                >
                    <Plus size={14} /> <span className="hidden sm:inline">Add Client</span>
                </button>
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 relative custom-scrollbar rounded-b-xl print:overflow-visible print:pb-0">
        <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-20 print:static print:bg-white print:text-black print:shadow-none print:border-b-2 print:border-black">
              <tr>
                {state.settings.columnOrder.map(key => {
                  if (key === 'actions') return <th key={key} className="w-[40px] px-0 py-3 sticky top-0 right-0 z-30 bg-gray-50 dark:bg-gray-800 print:hidden"></th>;
                  return (
                      <th key={key} className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider border-r border-gray-100 dark:border-gray-700/50 last:border-none print:border-none print:px-2">
                          {state.settings.customHeaders[key] || key}
                      </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 print:divide-gray-300">
              {filteredRecords.map((record, index) => {
                const isSelected = selectedIds.has(record.id);
                
                let rowClass = index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/30 dark:bg-gray-800/20';
                
                if (isSelected) {
                   rowClass = 'bg-brand-50/80 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 !border-l-4 border-l-brand-500';
                }

                // C. Dynamic Row Text Color (Default)
                let textColorClass = 'text-gray-700 dark:text-gray-300';

                return (
                  <tr 
                    key={record.id} 
                    className={`group transition-colors duration-100 cursor-pointer border-l-2 border-l-transparent hover:border-l-brand-400 relative hover:bg-blue-50/60 dark:hover:bg-blue-900/10 ${rowClass} print:hover:bg-transparent print:border-none`}
                    onClick={(e) => handleRowClick(e, record)}
                  >
                    {state.settings.columnOrder.map(key => {
                       if (key === 'actions') {
                         return (
                           <td key={key} className="px-1 py-0.5 text-right sticky right-0 z-10 bg-inherit group-hover:bg-white dark:group-hover:bg-gray-800 border-l border-transparent group-hover:border-gray-100 dark:group-hover:border-gray-700 shadow-none group-hover:shadow-[-5px_0_10px_-2px_rgba(0,0,0,0.05)] opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => handleOpenEdit(record)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-blue-600 transition-colors" title="Edit Record">
                                    <Edit size={16} />
                                </button>
                              </div>
                           </td>
                         );
                       }
                       // Pass dynamic text color to cell renderer
                       return <td key={key} className="px-5 py-2.5 border-r border-transparent group-hover:border-gray-100 dark:group-hover:border-gray-700/50 print:px-2 print:border-none">{renderCell(key, record, index, textColorClass)}</td>
                    })}
                  </tr>
                );
              })}
              <tr className="h-16 print:hidden">
                  <td colSpan={state.settings.columnOrder.length} className="border-none"></td>
              </tr>
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-800 font-bold border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] sticky bottom-0 z-30 print:static print:bg-white print:shadow-none print:border-t-2 print:border-black" style={{ insetBlockEnd: 0 }}>
               <tr>
                  {state.settings.columnOrder.map(key => {
                     if (key === 'displayClientId') return <td key={key} className="px-5 py-3 text-[11px] text-gray-500 bg-gray-100 dark:bg-gray-800 print:bg-white print:text-black">TOTAL</td>;
                     if (key === 'payable') return <td key={key} className="px-5 py-3 bg-gray-100 dark:bg-gray-800 text-sm print:bg-white">{totals.payable}</td>;
                     if (key === 'paid') return <td key={key} className="px-5 py-3 bg-gray-100 dark:bg-gray-800 text-green-600 text-sm print:bg-white print:text-black">{totals.paid}</td>;
                     if (key === 'status') return <td key={key} className="px-5 py-3 bg-gray-100 dark:bg-gray-800 text-red-600 text-sm print:bg-white print:text-black">{totals.due}</td>;
                     return <td key={key} className="px-5 py-3 bg-gray-100 dark:bg-gray-800 print:bg-white"></td>;
                  })}
               </tr>
            </tfoot>
        </table>
        
        {filteredRecords.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Search size={40} className="mb-4 opacity-20" />
                <p className="text-sm">No records found matching your filters.</p>
            </div>
        )}
      </div>

      {selectedIds.size > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full px-6 py-3 shadow-2xl flex items-center gap-4 animate-slide-up z-50 print:hidden">
              <span className="text-sm font-bold">{selectedIds.size} Selected</span>
              <div className="h-4 w-px bg-gray-700"></div>
              <button onClick={handleBulkMarkPaid} className="flex items-center gap-2 hover:text-green-400 transition-colors text-xs font-bold uppercase">
                  <Check size={16} /> Mark Paid
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-2 hover:text-red-400"><X size={16}/></button>
          </div>
      )}

      <div className="hidden print-footer">
         <p>Document generated by {state.settings.userName || 'System'} via ISPLedger | {new Date().toLocaleString()}</p>
      </div>
      
      {/* Existing Modals ... */}
      <Modal isOpen={isAddClientOpen} onClose={() => setIsAddClientOpen(false)} title="Add New Client">
         {/* ... Content of Add Client Modal ... */}
         <div className="space-y-4">
          <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" placeholder="Full Name" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddClient()} autoFocus />
          <div className="grid grid-cols-2 gap-4">
             <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" placeholder="Username" value={newClient.username} onChange={e => setNewClient({...newClient, username: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
             <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" placeholder="Client ID (Optional)" value={newClient.clientId || ''} onChange={e => setNewClient({...newClient, clientId: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
          </div>
          <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" placeholder="Contact Number" value={newClient.contactNumber} onChange={e => setNewClient({...newClient, contactNumber: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
          <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" placeholder="Full Address" value={newClient.fullAddress} onChange={e => setNewClient({...newClient, fullAddress: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
          <div className="grid grid-cols-2 gap-4">
            <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" placeholder="Area" list="areas" value={newClient.area} onChange={e => setNewClient({...newClient, area: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
            <select 
               className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm"
               value={newClient.clientType || 'Home User'}
               onChange={e => setNewClient({...newClient, clientType: e.target.value})}
               onKeyDown={e => e.key === 'Enter' && handleAddClient()}
            >
               <option value="Home User">Home User</option>
               <option value="Office">Office</option>
               <option value="Corporate">Corporate</option>
               <option value="Special">Special</option>
               <option value="Custom">Custom</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <select 
               className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm"
               value={newClient.lineType || 'Cat5'}
               onChange={e => setNewClient({...newClient, lineType: e.target.value})}
               onKeyDown={e => e.key === 'Enter' && handleAddClient()}
            >
               <option value="Cat5">Cat5</option>
               <option value="Fiber">Optical Fiber</option>
            </select>
             <div className="relative">
                <input type="date" className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" value={newClient.joiningDate} onChange={e => setNewClient({...newClient, joiningDate: e.target.value})} title="Joining Date" onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
                <label className="absolute -top-2 left-2 text-[10px] bg-white dark:bg-gray-800 px-1 text-gray-500 font-medium">Joining Date</label>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div className="relative">
                <select 
                  className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm pl-9" 
                  value={newClient.bandwidthPackage} 
                  onChange={e => {
                      const selectedPkg = state.settings.bandwidthPackages.find(p => p.name === e.target.value);
                      setNewClient({
                          ...newClient, 
                          bandwidthPackage: e.target.value,
                          baseMonthlyFee: selectedPkg ? selectedPkg.price : newClient.baseMonthlyFee
                      });
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleAddClient()}
                >
                    <option value="">Select Package</option>
                    {(state.settings.bandwidthPackages || []).map(pkg => (
                        <option key={pkg.id} value={pkg.name}>{pkg.name} - {pkg.bandwidth} ({state.settings.currencySymbol}{pkg.price})</option>
                    ))}
                </select>
                <Wifi size={14} className="absolute left-3 top-3 text-gray-400" />
                <label className="absolute -top-2 left-2 text-[10px] bg-white dark:bg-gray-800 px-1 text-gray-500 font-medium">Package</label>
             </div>
             <input 
                className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" 
                type="number" 
                placeholder="Monthly Fee" 
                value={newClient.baseMonthlyFee === 0 ? '' : newClient.baseMonthlyFee} 
                onChange={e => setNewClient({...newClient, baseMonthlyFee: Number(e.target.value)})}
                onKeyDown={e => e.key === 'Enter' && handleAddClient()}
             />
          </div>
          
          <datalist id="areas">{uniqueAreas.map((a: string) => <option key={a} value={a}/>)}</datalist>
          {state.settings.dynamicFields?.map(fieldKey => (
             <div key={fieldKey}>
               <label className="text-xs text-gray-500">{state.settings.customHeaders[fieldKey] || fieldKey}</label>
               <input 
                 className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm transition-shadow shadow-sm" 
                 placeholder={state.settings.customHeaders[fieldKey]}
                 value={newClient.customFields?.[fieldKey] || ''}
                 onChange={e => setNewClient({
                    ...newClient, 
                    customFields: { ...newClient.customFields, [fieldKey]: e.target.value }
                 })}
                 onKeyDown={e => e.key === 'Enter' && handleAddClient()}
               />
             </div>
          ))}
          
          <button className="w-full bg-brand-600 text-white py-3 rounded-lg hover:bg-brand-700 shadow-lg shadow-brand-500/20 font-bold text-sm transition-transform active:scale-[0.98]" onClick={handleAddClient}>Save Client</button>
        </div>
      </Modal>

      <Modal isOpen={isEditRecordOpen} onClose={() => setIsEditRecordOpen(false)} title="Update Client Record">
        {selectedRecord && (
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            
            <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-900/20">
               <button 
                 onClick={() => setShowAdvancedEdit(!showAdvancedEdit)}
                 className="w-full flex justify-between items-center text-blue-700 dark:text-blue-300 font-semibold text-xs"
               >
                 <span>Advanced Edit (Update Profile Info)</span>
                 <ChevronDown size={14} className={`transform transition-transform ${showAdvancedEdit ? 'rotate-180' : ''}`} />
               </button>
               
               {showAdvancedEdit && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-blue-200 dark:border-blue-800/30 animate-fade-in">
                     <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Client Name</label>
                        <input className="w-full border p-2 rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" value={advancedEditData.name || ''} onChange={e => setAdvancedEditData({...advancedEditData, name: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)} />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Contact Number</label>
                            <input className="w-full border p-2 rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" value={advancedEditData.contactNumber || ''} onChange={e => setAdvancedEditData({...advancedEditData, contactNumber: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)} />
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Area</label>
                            <input className="w-full border p-2 rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" value={advancedEditData.area || ''} onChange={e => setAdvancedEditData({...advancedEditData, area: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)} />
                         </div>
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Line Type</label>
                            <select 
                               className="w-full border p-2 rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" 
                               value={advancedEditData.lineType || 'Cat5'} 
                               onChange={e => setAdvancedEditData({...advancedEditData, lineType: e.target.value})}
                               onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)}
                            >
                               <option value="Cat5">Cat5</option>
                               <option value="Fiber">Optical Fiber</option>
                            </select>
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Client Type</label>
                            <select 
                               className="w-full border p-2 rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" 
                               value={advancedEditData.clientType || 'Home User'} 
                               onChange={e => setAdvancedEditData({...advancedEditData, clientType: e.target.value})}
                               onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)}
                            >
                                <option value="Home User">Home User</option>
                                <option value="Office">Office</option>
                                <option value="Corporate">Corporate</option>
                                <option value="Special">Special</option>
                                <option value="Custom">Custom</option>
                            </select>
                         </div>
                     </div>
                     <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Bandwidth Package</label>
                        <select 
                            className="w-full border p-2 rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" 
                            value={advancedEditData.bandwidthPackage || ''} 
                            onChange={e => setAdvancedEditData({...advancedEditData, bandwidthPackage: e.target.value})}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)}
                        >
                            {(state.settings.bandwidthPackages || []).map(pkg => (
                                <option key={pkg.id} value={pkg.name}>{pkg.name}</option>
                            ))}
                        </select>
                     </div>
                  </div>
               )}
            </div>

            <div>
                <h3 className="text-xs font-bold text-brand-600 uppercase mb-3">Payment Details</h3>
                <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Payable (This Month)</label>
                    <input 
                    type="number"
                    className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 font-bold" 
                    value={selectedRecord.payableAmount === 0 ? '' : selectedRecord.payableAmount} 
                    onChange={e => {
                        const newPayable = Number(e.target.value);
                        setSelectedRecord({...selectedRecord, payableAmount: newPayable});
                    }}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)}
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Paid Amount</label>
                    <input 
                    className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-green-500 font-bold text-green-600" 
                    type="number"
                    value={selectedRecord.paidAmount === 0 ? '' : selectedRecord.paidAmount} 
                    onChange={e => {
                        const paid = Number(e.target.value);
                        const payable = selectedRecord.payableAmount;
                        let status = PaymentStatus.UNPAID;
                        if(paid >= payable) status = PaymentStatus.PAID;
                        else if(paid > 0) status = PaymentStatus.PARTIAL;
                        
                        let payDate = selectedRecord.paymentDate;
                        if (paid > 0 && !payDate) {
                            payDate = new Date().toISOString().slice(0, 10);
                        }
                        
                        setSelectedRecord({...selectedRecord, paidAmount: paid, status, paymentDate: payDate});
                    }} 
                    onFocus={e => e.target.select()}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)}
                    />
                </div>
                </div>
            </div>

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="text-xs text-gray-500 mb-1 block">Payment Date</label>
                 <input type="date" className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700" value={selectedRecord.paymentDate || ''} onChange={e => setSelectedRecord({...selectedRecord, paymentDate: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)} />
               </div>
               <div>
                 <label className="text-xs text-gray-500 mb-1 block">Receipt No</label>
                 <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700" value={selectedRecord.receiptNo || ''} onChange={e => setSelectedRecord({...selectedRecord, receiptNo: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)} />
               </div>
            </div>

            <div>
                <h3 className="text-xs font-bold text-brand-600 uppercase mb-3 mt-2">Status & Overdue</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Account Status</label>
                        <select className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700" value={selectedRecord.isActive ? 'true' : 'false'} onChange={e => setSelectedRecord({...selectedRecord, isActive: e.target.value === 'true'})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)}>
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">Inactive clients will carry forward to next month.</p>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Overdue (Months)</label>
                        <select className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700" value={selectedRecord.overdueMonths} onChange={e => setSelectedRecord({...selectedRecord, overdueMonths: Number(e.target.value)})}>
                            <option value={0}>0 - No Overdue</option>
                            <option value={1}>1 Month</option>
                            <option value={2}>2 Months</option>
                            <option value={3}>3+ Months</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Remarks</label>
                        <input className="w-full border p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700" value={selectedRecord.remarks || ''} onChange={e => setSelectedRecord({...selectedRecord, remarks: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleUpdateRecord(selectedRecord)} />
                    </div>
                </div>
            </div>

            <button className="w-full bg-brand-600 text-white py-3 rounded-lg hover:bg-brand-700 mt-2 shadow-lg shadow-brand-500/30 font-bold text-sm" onClick={() => handleUpdateRecord(selectedRecord)}>
               {showAdvancedEdit ? 'Update Record & Profile' : 'Update Record'}
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={isLeftClientsListOpen} onClose={() => setIsLeftClientsListOpen(false)} title="Archived / Left Clients">
          <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
              {leftClientsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                      <UserX size={40} className="mb-2 opacity-30" />
                      <p className="text-sm">No churned clients found.</p>
                  </div>
              ) : (
                  <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 sticky top-0">
                          <tr>
                              <th className="px-3 py-2">Name</th>
                              <th className="px-3 py-2">Username</th>
                              <th className="px-3 py-2">Left Date</th>
                              <th className="px-3 py-2">Area</th>
                              <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {leftClientsList.map(c => (
                              <tr key={c.id}>
                                  <td className="px-3 py-2 font-bold text-gray-700 dark:text-gray-300">{c.name}</td>
                                  <td className="px-3 py-2 text-gray-500">{c.username}</td>
                                  <td className="px-3 py-2 text-red-500 font-mono">{c.leftDate || '-'}</td>
                                  <td className="px-3 py-2 text-gray-500">{c.area}</td>
                                  <td className="px-3 py-2 text-right">
                                      <button 
                                        onClick={() => handleRestoreClient(c)}
                                        className="bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded text-[10px] font-bold border border-green-200"
                                      >
                                          Restore
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>
      </Modal>

      <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="Client Profile & History" width="max-w-4xl">
         {selectedClientForProfile && fullClientDetails && (
            <div>
               <div className="flex flex-col md:flex-row justify-between items-start mb-6 border-b pb-4 dark:border-gray-700 gap-6">
                  <div className="flex-1 w-full">
                     {!isEditingProfile ? (
                        <>
                           <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">{fullClientDetails.name}</h3>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${fullClientDetails.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {fullClientDetails.isActive ? 'Active' : 'Inactive'}
                              </span>
                           </div>
                           <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 mt-4 text-sm">
                              <div><span className="text-gray-400 text-xs uppercase block">ID</span> <span className="font-mono">{fullClientDetails.clientId}</span></div>
                              <div><span className="text-gray-400 text-xs uppercase block">Username</span> {fullClientDetails.username}</div>
                              <div><span className="text-gray-400 text-xs uppercase block">Contact</span> {fullClientDetails.contactNumber}</div>
                              <div><span className="text-gray-400 text-xs uppercase block">Area</span> {fullClientDetails.area}</div>
                              <div><span className="text-gray-400 text-xs uppercase block">Line</span> <span className="font-semibold">{fullClientDetails.lineType || 'Cat5'}</span></div>
                              <div><span className="text-gray-400 text-xs uppercase block">Package</span> <span className="font-semibold font-mono">{fullClientDetails.bandwidthPackage || '10 Mbps'}</span></div>
                              <div><span className="text-gray-400 text-xs uppercase block">Type</span> <span className="font-semibold">{fullClientDetails.clientType || 'Home User'}</span></div>
                              <div><span className="text-gray-400 text-xs uppercase block">Monthly Fee</span> <span className="font-semibold">{state.settings.currencySymbol}{fullClientDetails.baseMonthlyFee}</span></div>
                              <div><span className="text-gray-400 text-xs uppercase block">Joined</span> {fullClientDetails.joiningDate || 'N/A'}</div>
                              <div className="col-span-2"><span className="text-gray-400 text-xs uppercase block">Address</span> {fullClientDetails.fullAddress}</div>
                           </div>
                        </>
                     ) : (
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg space-y-3 animate-fade-in border border-gray-200 dark:border-gray-600">
                            {/* ... (Existing Edit Form) ... */}
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs text-gray-500">Name</label><input className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={profileEditData.name || ''} onChange={e => setProfileEditData({...profileEditData, name: e.target.value})} /></div>
                                <div><label className="text-xs text-gray-500">Username</label><input className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={profileEditData.username || ''} onChange={e => setProfileEditData({...profileEditData, username: e.target.value})} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs text-gray-500">Contact</label><input className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={profileEditData.contactNumber || ''} onChange={e => setProfileEditData({...profileEditData, contactNumber: e.target.value})} /></div>
                                <div><label className="text-xs text-gray-500">Area</label><input className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={profileEditData.area || ''} onChange={e => setProfileEditData({...profileEditData, area: e.target.value})} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-xs text-gray-500">Status</label><select className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={String(profileEditData.isActive)} onChange={e => setProfileEditData({...profileEditData, isActive: e.target.value === 'true'})}><option value="true">Active</option><option value="false">Inactive</option></select></div>
                                <div>
                                    <label className="text-xs text-gray-500">Client Type</label>
                                    <select 
                                        className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" 
                                        value={profileEditData.clientType || 'Home User'} 
                                        onChange={e => setProfileEditData({...profileEditData, clientType: e.target.value})}
                                    >
                                        <option value="Home User">Home User</option>
                                        <option value="Office">Office</option>
                                        <option value="Corporate">Corporate</option>
                                        <option value="Special">Special</option>
                                        <option value="Custom">Custom</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                               <p className="text-xs font-bold text-gray-500 uppercase mb-2">Billing & Overdue Settings</p>
                               <div className="grid grid-cols-2 gap-3">
                                  <div>
                                      <label className="text-xs text-gray-500">Package</label>
                                      <select 
                                        className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" 
                                        value={profileEditData.bandwidthPackage || ''} 
                                        onChange={e => {
                                            const selectedPkg = state.settings.bandwidthPackages.find(p => p.name === e.target.value);
                                            setProfileEditData({
                                                ...profileEditData, 
                                                bandwidthPackage: e.target.value,
                                                baseMonthlyFee: selectedPkg ? selectedPkg.price : profileEditData.baseMonthlyFee
                                            });
                                        }}
                                      >
                                          {(state.settings.bandwidthPackages || []).map(pkg => (
                                              <option key={pkg.id} value={pkg.name}>{pkg.name}</option>
                                          ))}
                                      </select>
                                  </div>
                                  <div><label className="text-xs text-gray-500">Monthly Fee</label><input type="number" className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={profileEditData.baseMonthlyFee !== undefined ? profileEditData.baseMonthlyFee : ''} onChange={e => setProfileEditData({...profileEditData, baseMonthlyFee: Number(e.target.value)})} /></div>
                                  <div><label className="text-xs text-gray-500">Overdue Months</label><input type="number" min="0" className="w-full border p-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white" value={profileEditData.overdueMonths !== undefined ? profileEditData.overdueMonths : 0} onChange={e => setProfileEditData({...profileEditData, overdueMonths: Number(e.target.value)})} /></div>
                                </div>
                               <div className="mt-2 text-right bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                                  <span className="text-xs text-gray-500">Calculated Total Due: </span>
                                  <span className="font-bold text-blue-600 dark:text-blue-400">
                                     {state.settings.currencySymbol}
                                     {((profileEditData.baseMonthlyFee || 0) * (profileEditData.overdueMonths || 0)).toLocaleString()}
                                  </span>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-2">
                                <button onClick={() => setIsEditingProfile(false)} className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded">Cancel</button>
                                <button onClick={handleSaveProfile} className="text-xs px-3 py-1 bg-green-600 text-white rounded flex items-center gap-1"><Save size={12}/> Save Changes</button>
                            </div>
                        </div>
                     )}

                     {/* ASSET SECTION IN PROFILE */}
                     <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <Box size={16} /> Asset Tracking
                            </h4>
                            {!isEditingProfile && (
                                <button onClick={() => setIsAssignAssetOpen(true)} className="text-xs bg-brand-50 text-brand-600 px-2 py-1 rounded hover:bg-brand-100 font-bold border border-brand-200">
                                    + Assign Asset
                                </button>
                            )}
                        </div>
                        {isAssignAssetOpen ? (
                             <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-brand-200 dark:border-brand-900 animate-slide-up">
                                 <p className="text-xs font-bold text-gray-500 mb-2">Assign from Inventory</p>
                                 <select 
                                     className="w-full text-xs p-2 rounded border mb-2 dark:bg-gray-800 dark:text-white"
                                     value={newAssetAssignment.itemId}
                                     onChange={e => setNewAssetAssignment({...newAssetAssignment, itemId: e.target.value})}
                                 >
                                     <option value="">Select Item...</option>
                                     {state.inventory?.filter(i => i.stockCount > 0).map(i => (
                                         <option key={i.id} value={i.id}>{i.name} ({i.stockCount} left)</option>
                                     ))}
                                 </select>
                                 <div className="grid grid-cols-2 gap-2 mb-2">
                                    <select 
                                        className="text-xs p-2 rounded border dark:bg-gray-800 dark:text-white"
                                        value={newAssetAssignment.status}
                                        onChange={e => setNewAssetAssignment({...newAssetAssignment, status: e.target.value as any})}
                                    >
                                        <option value="Sold">Sold (Profit)</option>
                                        <option value="Lent">Lent (Returnable)</option>
                                        <option value="Free">Free / Gift</option>
                                    </select>
                                    {newAssetAssignment.status === 'Sold' && (
                                        <input 
                                            type="number"
                                            placeholder="Price Charged"
                                            className="text-xs p-2 rounded border dark:bg-gray-800 dark:text-white"
                                            value={newAssetAssignment.price || ''}
                                            onChange={e => setNewAssetAssignment({...newAssetAssignment, price: Number(e.target.value)})}
                                        />
                                    )}
                                 </div>
                                 <div className="flex justify-end gap-2">
                                     <button onClick={() => setIsAssignAssetOpen(false)} className="text-xs px-2 py-1 bg-gray-200 rounded">Cancel</button>
                                     <button onClick={handleAssignAsset} className="text-xs px-2 py-1 bg-brand-600 text-white rounded">Confirm</button>
                                 </div>
                             </div>
                        ) : (
                            <div className="space-y-2">
                                {fullClientDetails.assignedAssets?.map(asset => (
                                    <div key={asset.id} className="flex justify-between items-center text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                                        <div>
                                            <span className="font-bold">{asset.name}</span>
                                            <span className="text-gray-400 mx-2">|</span>
                                            <span className={`${asset.status === 'Sold' ? 'text-green-600' : 'text-orange-500'} font-bold`}>{asset.status}</span>
                                            {asset.status === 'Sold' && <span className="text-gray-500 ml-1">({state.settings.currencySymbol}{asset.priceCharged})</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-gray-400">{asset.assignedDate}</span>
                                            <button onClick={() => handleReturnAsset(asset.id, asset.inventoryItemId)} className="text-red-500 hover:text-red-700" title="Return to Stock">
                                                <RotateCcw size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {(!fullClientDetails.assignedAssets || fullClientDetails.assignedAssets.length === 0) && (
                                    <p className="text-xs text-gray-400 italic">No assets assigned.</p>
                                )}
                            </div>
                        )}
                     </div>

                  </div>
                  
                  <div className="flex flex-col gap-2 min-w-[150px]">
                     <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-right border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Paid</p>
                        <p className="text-xl font-black text-green-600">{state.settings.currencySymbol}{clientHistoryTotals.paid}</p>
                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-2"></div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Outstanding</p>
                        <p className="text-xl font-black text-red-600">{state.settings.currencySymbol}{clientHistoryTotals.due}</p>
                     </div>
                     <div className="flex gap-2 justify-end flex-wrap mt-2">
                         <button 
                            onClick={() => setIsEditingProfile(!isEditingProfile)} 
                            className={`p-2 rounded-lg border ${isEditingProfile ? 'bg-gray-200 text-gray-600' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'} transition-colors`} 
                            title="Edit Profile Info"
                         >
                            <Edit size={16} />
                         </button>
                         <button 
                            onClick={handlePrintProfile} 
                            className="p-2 rounded-lg border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 transition-colors" 
                            title="Print Profile"
                         >
                            <Printer size={16} />
                         </button>
                         <button 
                            onClick={() => setIsDeleteOptionsOpen(true)}
                            className="px-3 py-1 rounded-lg text-white flex items-center gap-1 transition-colors bg-red-500 hover:bg-red-600 shadow-md"
                            title="Delete Options"
                         >
                            <Trash2 size={16} />
                         </button>
                     </div>
                  </div>
               </div>

               <div className="max-h-[350px] overflow-y-auto border rounded-xl dark:border-gray-700 custom-scrollbar">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 sticky top-0 font-medium z-10 text-xs uppercase tracking-wider">
                        <tr>
                           <th className="px-4 py-3">Month</th>
                           <th className="px-4 py-3 text-right">Bill</th>
                           <th className="px-4 py-3 text-right">Paid</th>
                           <th className="px-4 py-3 text-right">Due</th>
                           <th className="px-4 py-3 text-center">Status</th>
                           <th className="px-4 py-3">Receipt</th>
                           <th className="px-4 py-3">Remarks</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {clientHistory.map(r => (
                           <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                              <td className="px-4 py-3 text-gray-800 dark:text-gray-200 font-mono text-xs">{r.monthKey}</td>
                              <td className="px-4 py-3 text-right font-medium">{r.payableAmount}</td>
                              <td className="px-4 py-3 text-right text-green-600 font-bold">{r.paidAmount}</td>
                              <td className="px-4 py-3 text-right text-red-500 font-bold">{r.payableAmount - r.paidAmount}</td>
                              <td className="px-4 py-3 text-center">
                                 <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                    r.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                 }`}>
                                    {r.status}
                                 </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                                  {r.receiptNo || '-'}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 italic">{r.remarks || '-'}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {clientHistory.length === 0 && <p className="text-center p-8 text-gray-400">No payment history found.</p>}
               </div>
            </div>
         )}
      </Modal>

      <Modal isOpen={isDeleteOptionsOpen} onClose={() => setIsDeleteOptionsOpen(false)} title="Confirm Deletion">
          <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl flex gap-3 border border-red-100 dark:border-red-900/30">
                  <div className="shrink-0 pt-1">
                      <AlertCircle size={24} className="text-red-600" />
                  </div>
                  <div>
                      <h3 className="font-bold text-gray-800 dark:text-white">Why are you removing this client?</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Please select the appropriate reason to ensure accurate reporting.</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                  <button 
                      onClick={handlePermanentDelete}
                      className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left group"
                  >
                      <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg group-hover:bg-white dark:group-hover:bg-gray-600 text-gray-500">
                          <Trash2 size={20} />
                      </div>
                      <div>
                          <p className="font-bold text-sm text-gray-800 dark:text-white">Normal Delete (Permanent)</p>
                          <p className="text-xs text-gray-500">For accidental entries or test clients. Removes all history.</p>
                      </div>
                  </button>

                  <button 
                      onClick={handleMarkAsLeft}
                      className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors text-left group"
                  >
                      <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600">
                          <UserMinus size={20} />
                      </div>
                      <div>
                          <p className="font-bold text-sm text-gray-800 dark:text-white">Client Left (Churn)</p>
                          <p className="text-xs text-gray-500">Client has disconnected. Archives history for reporting.</p>
                      </div>
                  </button>
              </div>
              
              <div className="text-center pt-2">
                  <button onClick={() => setIsDeleteOptionsOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Cancel</button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={isGenerateMonthOpen} onClose={() => setIsGenerateMonthOpen(false)} title="Generate New Month Sheet">
        <div className="space-y-6">
           <div className="bg-yellow-50 dark:bg-yellow-900/20 p-5 rounded-xl border border-yellow-100 dark:border-yellow-900/30 flex gap-4">
              <div className="shrink-0 pt-1">
                 <AlertCircle size={24} className="text-yellow-600" />
              </div>
              <div>
                <p className="text-gray-800 dark:text-gray-200 font-bold text-lg mb-2">
                    Confirm Generation
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    You are about to generate bills for the next month based on the currently selected month.
                </p>
                <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>All <span className="font-bold">Active</span> clients will be carried forward.</li>
                    <li>Unpaid dues will be added to the new bill as <span className="font-bold">Previous Due</span>.</li>
                    <li>Overdue counters will increment automatically.</li>
                </ul>
              </div>
           </div>
           <div className="flex gap-4 pt-2">
              <button onClick={() => setIsGenerateMonthOpen(false)} className="flex-1 border p-3 rounded-xl hover:bg-gray-50 bg-white text-gray-900 dark:bg-gray-800 dark:text-white dark:border-gray-700 transition-colors font-medium">Cancel</button>
              <button onClick={handleGenerateNextMonth} className="flex-1 bg-brand-600 text-white p-3 rounded-xl hover:bg-brand-700 shadow-lg shadow-brand-500/30 transition-transform active:scale-[0.98] font-bold">Generate Sheet</button>
           </div>
        </div>
      </Modal>
    </div>
  );
};
