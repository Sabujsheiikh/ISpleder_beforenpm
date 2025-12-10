
import { GlobalState, AppSettings, Client, MonthlyRecord, ExpenseTransaction, PaymentStatus, ExpenseType, BandwidthPackage } from '../types';
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../constants';

const INITIAL_STATE: GlobalState = {
  clients: [],
  records: [],
  expenses: [],
  inventory: [], 
  inventoryHistory: [], // NEW
  settings: DEFAULT_SETTINGS,
  currentViewMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  networkDiagram: {
      nodes: [],
      links: [],
      zoom: 1,
      pan: { x: 0, y: 0 },
      rotation: 0
  }
};

export const loadDB = (): GlobalState => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (!parsed.settings.columnOrder) parsed.settings.columnOrder = DEFAULT_SETTINGS.columnOrder;
      if (!parsed.settings.dynamicFields) parsed.settings.dynamicFields = [];
        // Ensure customHeaders object exists before accessing its properties
        if (!parsed.settings.customHeaders || typeof parsed.settings.customHeaders !== 'object') {
          parsed.settings.customHeaders = { ...DEFAULT_SETTINGS.customHeaders };
        } else {
          parsed.settings.customHeaders = { ...DEFAULT_SETTINGS.customHeaders, ...parsed.settings.customHeaders };
        }
        if (!parsed.settings.customHeaders.clientType) parsed.settings.customHeaders.clientType = 'Client Type';
      
      if (parsed.settings.autoBackupEnabled === undefined) {
         parsed.settings.autoBackupEnabled = true;
         parsed.settings.lastBackupDate = '';
      }
      if (parsed.settings.maxDueDate === undefined) parsed.settings.maxDueDate = 10;
      if (!parsed.settings.brandColor) parsed.settings.brandColor = 'blue';
      if (!parsed.inventory) parsed.inventory = [];
      if (!parsed.inventoryHistory) parsed.inventoryHistory = []; // NEW
      
      // MIGRATION: Convert legacy string[] packages to BandwidthPackage[] objects
      if (parsed.settings.bandwidthPackages && Array.isArray(parsed.settings.bandwidthPackages) && typeof parsed.settings.bandwidthPackages[0] === 'string') {
          parsed.settings.bandwidthPackages = parsed.settings.bandwidthPackages.map((p: string) => ({
              id: crypto.randomUUID(),
              name: p,
              bandwidth: p,
              price: 0,
              remark: ''
          }));
      }
      
      // Ensure Diagram State exists
      if (!parsed.networkDiagram) {
          parsed.networkDiagram = { nodes: [], links: [], zoom: 1, pan: { x: 0, y: 0 }, rotation: 0 };
      } else if (parsed.networkDiagram.rotation === undefined) {
          parsed.networkDiagram.rotation = 0;
      }

      return parsed;
    }
  } catch (e) {
    console.error("Failed to load DB", e);
  }
  return INITIAL_STATE;
};

export const saveDB = (state: GlobalState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Notify host (if present) that a save occurred — helps diagnose persistence issues
    try {
      if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'save_db', status: 'ok', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      // ignore reporting errors
    }
  } catch (err) {
    console.error('Failed to save DB', err);
    try {
      if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage(JSON.stringify({ action: 'save_db', status: 'error', message: String(err), timestamp: new Date().toISOString() }));
      }
    } catch (e) { }
  }
};

export const exportData = (state: GlobalState, silent: boolean = false) => {
    if (!silent && !confirm("Are you sure you want to download the system backup file?")) return;

    const dateStr = new Date().toISOString().split('T')[0];
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `KAMS_Backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// Logic to generate new month records based on previous month
export const generateNextMonth = (currentState: GlobalState, targetMonthKey: string): GlobalState => {
  const newState = { ...currentState };
  
  // 1. Check if month already exists
  const exists = newState.records.some(r => r.monthKey === targetMonthKey);
  if (exists) {
    throw new Error("Records for this month already exist.");
  }

  // 2. Identify previous month logic
  const [year, month] = targetMonthKey.split('-').map(Number);
  const prevDateObj = new Date(year, month - 2); 
  const prevMonthKey = prevDateObj.getFullYear() + '-' + String(prevDateObj.getMonth() + 1).padStart(2, '0');

  // 3. Calculate Cash In Hand (Opening Balance Logic) from ALL previous history up to now
  // Correct Logic: Sum of ALL Credit (Income) minus Sum of ALL Debit (Expense) before the new month start date.
  
  const allPastExpenses = newState.expenses.filter(e => e.date < `${targetMonthKey}-01`);
  const totalDebit = allPastExpenses.filter(e => e.type === ExpenseType.DEBIT).reduce((sum, e) => sum + e.amount, 0);
  const totalCredit = allPastExpenses.filter(e => e.type === ExpenseType.CREDIT).reduce((sum, e) => sum + e.amount, 0);
  
  const cashInHand = totalCredit - totalDebit;

  if (cashInHand > 0) {
      // Create Opening Balance Entry
      const openingBalanceEntry: ExpenseTransaction = {
          id: crypto.randomUUID(),
          date: `${targetMonthKey}-01`, // 1st of new month
          amount: cashInHand,
          type: ExpenseType.CREDIT,
          category: 'Opening Balance',
          description: `B/F from Previous Month (Cash in Hand)`
      };
      newState.expenses = [...newState.expenses, openingBalanceEntry];
  }

  // 4. Client Carry Forward Logic
  // LOGIC UPDATE: Include Inactive clients (carry forward) BUT Exclude Archived (Left) clients.
  const eligibleClients = newState.clients.filter(c => !c.isArchived);

  const newRecords: MonthlyRecord[] = eligibleClients.map(client => {
    // Aggregate all prior unpaid amounts (sum of dues from any previous months)
    const priorRecords = newState.records.filter(r => r.clientId === client.id && r.monthKey < targetMonthKey);
    let previousDue = 0;
    let priorUnpaidCount = 0;
    priorRecords.forEach(pr => {
      const due = (pr.payableAmount || 0) - (pr.paidAmount || 0);
      if (due > 0) {
        previousDue += due;
        priorUnpaidCount += 1;
      }
    });

    // overdueMonths for the new month is number of prior unpaid months + this new unpaid month
    const overdueMonths = priorUnpaidCount + 1;

    return {
      id: crypto.randomUUID(),
      clientId: client.id,
      displayClientId: client.clientId,
      monthKey: targetMonthKey,
      clientName: client.name,
      username: client.username,
      area: client.area,
      clientType: client.clientType || 'Home User',
      lineType: client.lineType || 'Cat5', 
      bandwidthPackage: client.bandwidthPackage || '10 Mbps', 
      contact: client.contactNumber,
      address: client.fullAddress,
      isActive: client.isActive, // Preserves inactive status if they were inactive (Carry Forward Inactive)
      billDate: new Date().toISOString(),
      // Auto-Billing Logic: Base Fee + Previous Due
      payableAmount: (client.baseMonthlyFee || 0) + previousDue,
      paidAmount: 0,
      status: PaymentStatus.UNPAID,
      overdueMonths: overdueMonths, // Increment overdue count
      remarks: previousDue > 0 ? `Prev Due: ${previousDue}` : '',
      paymentDate: '',
      receiptNo: '',
      customFields: client.customFields || {} 
    };
  });

  newState.records = [...newState.records, ...newRecords];
  newState.currentViewMonth = targetMonthKey;
  
  return newState;
};