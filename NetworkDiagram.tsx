
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GlobalState, DiagramNode, DiagramLink, ExpenseType, InventoryItem, Client, InventoryTransaction } from '../types';
import { 
  Plus, Minus, X, ZoomIn, ZoomOut, RotateCcw,
  Search, Maximize, Save, Trash2, ArrowRight, CornerUpLeft, CornerUpRight, User, Link
} from '../components/ui/Icons';

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    targetId?: string;
    type: 'canvas' | 'node' | 'link';
}

interface NetworkDiagramProps {
  state: GlobalState;
  updateState?: (newState: GlobalState) => void;
}

export const NetworkDiagram: React.FC<NetworkDiagramProps> = ({ state, updateState }) => {
    // --- STATE ---
    // Nodes & Links
    const [nodes, setNodes] = useState<DiagramNode[]>(() => {
        if (state.networkDiagram?.nodes && state.networkDiagram.nodes.length > 0) {
            return state.networkDiagram.nodes;
        }
        return [{ id: 'root', x: 400, y: 300, label: 'Core Switch', type: 'Switch', color: '#3b82f6' }];
    });
    const [links, setLinks] = useState<DiagramLink[]>(state.networkDiagram?.links || []);
    
    // Viewport
    const [zoom, setZoom] = useState(state.networkDiagram?.zoom || 1);
    const [pan, setPan] = useState(state.networkDiagram?.pan || { x: 0, y: 0 });
    const [rotation, setRotation] = useState(state.networkDiagram?.rotation || 0);

    // Search State
    const [selectedSearchNode, setSelectedSearchNode] = useState('');
    const [selectedSearchCustomer, setSelectedSearchCustomer] = useState('');

    // History (Undo/Redo)
    const [history, setHistory] = useState<{nodes: DiagramNode[], links: DiagramLink[]}[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Interaction
    const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // Screen coords
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [isConnectMode, setIsConnectMode] = useState(false);
    const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // World coords

    // UI
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, type: 'canvas' });
    const [activeModal, setActiveModal] = useState<'none' | 'rename' | 'fanout' | 'assign' | 'color' | 'edit_cable' | 'add_client'>('none');
    const [tempData, setTempData] = useState<any>({});
    
    const containerRef = useRef<HTMLDivElement>(null);

    // --- COMPUTED DATA ---
    const clientNodes = useMemo(() => nodes.filter(n => n.type === 'Client'), [nodes]);
    
    // --- PERSISTENCE ---
    useEffect(() => {
        if (updateState) {
            const timer = setTimeout(() => {
                updateState({
                    ...state,
                    networkDiagram: { nodes, links, zoom, pan, rotation }
                });
            }, 1000); // Debounce save
            return () => clearTimeout(timer);
        }
    }, [nodes, links, zoom, pan, rotation]);

    // --- HISTORY MANAGEMENT ---
    const saveToHistory = useCallback(() => {
        const currentSnapshot = { nodes: JSON.parse(JSON.stringify(nodes)), links: JSON.parse(JSON.stringify(links)) };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(currentSnapshot);
        // Limit history size
        if (newHistory.length > 50) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [nodes, links, history, historyIndex]);

    const undo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            const snapshot = history[prevIndex];
            setNodes(snapshot.nodes);
            setLinks(snapshot.links);
            setHistoryIndex(prevIndex);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            const snapshot = history[nextIndex];
            setNodes(snapshot.nodes);
            setLinks(snapshot.links);
            setHistoryIndex(nextIndex);
        }
    };

    // Initial History Save
    useEffect(() => {
        if (history.length === 0) {
            setHistory([{ nodes, links }]);
            setHistoryIndex(0);
        }
    }, []);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history, historyIndex]);


    // --- COORDINATE MATH ---
    // Maps Screen (ClientXY) -> World (DiagramXY)
    const getDiagramPos = (clientX: number, clientY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        
        // 1. Relative to Container Top-Left
        const dx = clientX - rect.left - pan.x;
        const dy = clientY - rect.top - pan.y;

        // 2. Un-Rotate
        // x' = x cos(-θ) - y sin(-θ)
        // y' = x sin(-θ) + y cos(-θ)
        const rad = -rotation * (Math.PI / 180);
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

        // 3. Un-Scale
        return {
            x: rx / zoom,
            y: ry / zoom
        };
    };

    const centerOnNode = (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!containerRef.current || !node) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate new pan to put node in center
        // We essentially reverse getDiagramPos logic but simpler for center
        // Desired: (node.x * zoom) + newPanX = centerX
        
        // Simplified for 0 rotation start (complex rotation centering needs matrix math, skipping for UX simplicity)
        const newPanX = centerX - (node.x * zoom);
        const newPanY = centerY - (node.y * zoom);

        setPan({ x: newPanX, y: newPanY });
        // Optional: Highlight node temporarily
        setHoveredNodeId(nodeId);
        setTimeout(() => setHoveredNodeId(null), 2000);
    };

    // --- MOUSE EVENT HANDLERS ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && !draggedNodeId)) { // Middle click or Left click on empty
            setIsDraggingCanvas(true);
            setDragStart({ x: e.clientX, y: e.clientY });
        }
        setContextMenu({ ...contextMenu, visible: false });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const worldPos = getDiagramPos(e.clientX, e.clientY);
        
        if (isConnectMode) {
            setMousePos(worldPos);
        }

        if (draggedNodeId) {
            setNodes(ns => ns.map(n => n.id === draggedNodeId ? { ...n, x: worldPos.x, y: worldPos.y } : n));
        } else if (isDraggingCanvas) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = () => {
        if (draggedNodeId) {
            saveToHistory(); // Save state after drag finishes
        }
        setDraggedNodeId(null);
        setIsDraggingCanvas(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(z => Math.max(0.1, Math.min(5, z * delta)));
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (e.button === 2) return; // Right click handled by context menu

        if (isConnectMode && connectSourceId && connectSourceId !== id) {
            saveToHistory();
            const newLink: DiagramLink = {
                id: crypto.randomUUID(),
                from: connectSourceId,
                to: id,
                color: '#9ca3af'
            };
            setLinks([...links, newLink]);
            setIsConnectMode(false);
            setConnectSourceId(null);
        } else {
            setDraggedNodeId(id);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, targetId?: string, type: 'canvas' | 'node' | 'link' = 'canvas') => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            targetId,
            type
        });
        
        // Pre-fill temp data for modals
        if (targetId) {
            if (type === 'node') {
                const node = nodes.find(n => n.id === targetId);
                if (node) setTempData({ ...node });
            } else if (type === 'link') {
                const link = links.find(l => l.id === targetId);
                if (link) setTempData({ ...link });
            }
        } else {
            // For Canvas right click - capture position for "Add Node Here"
            setTempData({ clickPos: getDiagramPos(e.clientX, e.clientY) });
        }
    };

    // --- ACTIONS ---
    const executeAction = (action: string) => {
        const { targetId } = contextMenu;
        setContextMenu({ ...contextMenu, visible: false });

        if (action === 'delete') {
            if (window.confirm("Delete selected item?")) {
                saveToHistory();
                setNodes(ns => ns.filter(n => n.id !== targetId));
                setLinks(ls => ls.filter(l => l.from !== targetId && l.to !== targetId));
            }
            return;
        }
        
        if (action === 'delete_link') {
            saveToHistory();
            setLinks(ls => ls.filter(l => l.id !== targetId));
            return;
        }

        if (action === 'add_node_here') {
            saveToHistory();
            const { x, y } = tempData.clickPos || { x: 0, y: 0 };
            const newNode: DiagramNode = {
                id: crypto.randomUUID(),
                x, y,
                label: 'New Node',
                type: 'Switch',
                color: '#60a5fa'
            };
            setNodes([...nodes, newNode]);
            return;
        }

        if (action === 'connect') {
            setIsConnectMode(true);
            setConnectSourceId(targetId || null);
            return;
        }

        // Modals
        if (action === 'rename') setActiveModal('rename');
        if (action === 'add_connections') setActiveModal('fanout');
        if (action === 'add_clients') setActiveModal('add_client'); // New Action
        if (action === 'assign_items') setActiveModal('assign');
        if (action === 'edit_cable') setActiveModal('edit_cable');
        if (action === 'color_edge') setActiveModal('color');
    };

    // --- FORM SUBMISSIONS ---
    const submitFanOut = () => {
        saveToHistory();
        const parentId = contextMenu.targetId;
        const parent = nodes.find(n => n.id === parentId);
        if (!parent) return;

        const count = parseInt(tempData.count) || 1;
        const newNodes: DiagramNode[] = [];
        const newLinks: DiagramLink[] = [];
        
        const spreadY = 60;
        const offsetX = 200;
        const startY = parent.y - ((count - 1) * spreadY) / 2;

        for (let i = 0; i < count; i++) {
            const nodeId = crypto.randomUUID();
            newNodes.push({
                id: nodeId,
                label: `Node-${nodes.length + i + 1}`,
                type: 'Client',
                x: parent.x + offsetX,
                y: startY + (i * spreadY),
                color: '#60a5fa'
            });
            newLinks.push({
                id: crypto.randomUUID(),
                from: parentId!,
                to: nodeId,
                color: '#9ca3af'
            });
        }

        setNodes([...nodes, ...newNodes]);
        setLinks([...links, ...newLinks]);
        setActiveModal('none');
    };

    const submitAddClient = (client: Client) => {
        saveToHistory();
        const parentId = contextMenu.targetId;
        const parent = nodes.find(n => n.id === parentId);
        if (!parent) return;

        // Check if already exists to prevent duplicates (optional, but good UX)
        // const exists = nodes.some(n => n.label === client.name); 
        
        const newNode: DiagramNode = {
            id: crypto.randomUUID(),
            label: client.username || client.name, // Use Username as requested
            type: 'Client',
            color: '#10b981', // Green for real clients
            x: parent.x + 250, // Fixed offset to the right
            y: parent.y + (Math.random() * 100 - 50) // Slight jitter to avoid exact stacking
        };

        const newLink: DiagramLink = {
            id: crypto.randomUUID(),
            from: parentId!,
            to: newNode.id,
            color: '#9ca3af',
            // label removed to prevent cable text clutter
        };

        setNodes([...nodes, newNode]);
        setLinks([...links, newLink]);
        setActiveModal('none');
        setTempData({});
    };

    const submitAssign = (item: InventoryItem) => {
        if (!contextMenu.targetId) return;
        saveToHistory();
        if (item.stockCount > 0 && updateState) {
            const newInv = state.inventory.map(i => i.id === item.id ? { ...i, stockCount: i.stockCount - 1 } : i);
            const expense = {
                id: crypto.randomUUID(),
                date: new Date().toISOString().slice(0, 10),
                amount: item.buyPrice,
                type: ExpenseType.DEBIT,
                category: 'Network Deployment',
                description: `Assigned ${item.name} to ${nodes.find(n => n.id === contextMenu.targetId)?.label}`
            };

            // CREATE LOG ENTRY
            const historyEntry: InventoryTransaction = {
                id: crypto.randomUUID(),
                date: new Date().toISOString().slice(0, 10),
                itemId: item.id,
                itemName: item.name,
                type: 'Assign',
                quantity: 1,
                remarks: `Assigned to Node: ${nodes.find(n => n.id === contextMenu.targetId)?.label}`
            };

            const currentHistory = state.inventoryHistory || [];

            updateState({ 
                ...state, 
                inventory: newInv, 
                expenses: [...state.expenses, expense],
                inventoryHistory: [...currentHistory, historyEntry] 
            });

            setNodes(ns => ns.map(n => n.id === contextMenu.targetId ? {
                ...n,
                assignedInventoryId: item.id,
                assignedInventoryName: item.name,
                assignedDate: new Date().toISOString().slice(0, 10)
            } : n));
        }
        setActiveModal('none');
    };

    const submitCableEdit = () => {
        saveToHistory();
        setLinks(ls => ls.map(l => l.id === contextMenu.targetId ? { ...l, label: tempData.label, length: tempData.length } : l));
        setActiveModal('none');
    };

    const submitRename = () => {
        saveToHistory();
        setNodes(ns => ns.map(n => n.id === contextMenu.targetId ? { ...n, label: tempData.label } : n));
        setActiveModal('none');
    };

    // --- RENDER HELPERS ---
    const renderLink = (link: DiagramLink) => {
        const source = nodes.find(n => n.id === link.from);
        const target = nodes.find(n => n.id === link.to);
        if (!source || !target) return null;

        // Tree Style Bezier
        const deltaX = target.x - source.x;
        const controlPointOffset = Math.abs(deltaX) * 0.5;
        const pathData = `M ${source.x} ${source.y} C ${source.x + controlPointOffset} ${source.y} ${target.x - controlPointOffset} ${target.y} ${target.x} ${target.y}`;
        
        // Midpoint for label
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;

        return (
            <g key={link.id} onContextMenu={(e) => handleContextMenu(e, link.id, 'link')}>
                <path 
                    d={pathData}
                    stroke={link.color || '#9ca3af'}
                    strokeWidth={Math.max(1.5, 2 / zoom)}
                    fill="none"
                    className="pointer-events-auto cursor-pointer hover:stroke-brand-500 hover:stroke-[3px] transition-all"
                />
                {(link.label || link.length) && (
                    <g transform={`translate(${midX}, ${midY})`}>
                        <rect x="-30" y="-10" width="60" height="16" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1" />
                        <text y="2" textAnchor="middle" fontSize="9" className="fill-gray-600 font-bold select-none pointer-events-none">
                            {link.label} {link.length ? `(${link.length})` : ''}
                        </text>
                    </g>
                )}
            </g>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-60px)] relative overflow-hidden bg-gray-100 dark:bg-gray-900 select-none">
            
            {/* TOP BAR / HEADER with Search */}
            <div className="absolute top-0 left-0 right-0 h-14 bg-white/90 dark:bg-gray-800/90 backdrop-blur border-b border-gray-200 dark:border-gray-700 z-10 flex items-center justify-between px-4 shadow-sm">
                
                {/* Search / Filter Section */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">NODE</label>
                        <select 
                            className="text-xs border rounded p-1 w-32 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 outline-none"
                            value={selectedSearchNode}
                            onChange={(e) => setSelectedSearchNode(e.target.value)}
                        >
                            <option value="">Select Node</option>
                            {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                        </select>
                        <button 
                            onClick={() => selectedSearchNode && centerOnNode(selectedSearchNode)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
                        >
                            Search Node
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">CUSTOMER</label>
                        <select 
                            className="text-xs border rounded p-1 w-32 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 outline-none"
                            value={selectedSearchCustomer}
                            onChange={(e) => setSelectedSearchCustomer(e.target.value)}
                        >
                            <option value="">Select Customer</option>
                            {clientNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                        </select>
                        <button 
                            onClick={() => selectedSearchCustomer && centerOnNode(selectedSearchCustomer)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
                        >
                            Search Customer
                        </button>
                    </div>
                </div>

                {/* Toolbar Controls */}
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Rotation</label>
                        <div className="flex items-center gap-1">
                            <input 
                                type="number" 
                                value={rotation} 
                                onChange={(e) => setRotation(Number(e.target.value))} 
                                className="w-12 h-6 border rounded px-1 text-xs font-mono bg-gray-50 dark:bg-gray-700 dark:text-white text-center"
                            />
                            <span className="text-[10px] text-gray-500">deg</span>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
                    <div className="flex gap-1">
                        <button onClick={undo} disabled={historyIndex <= 0} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30" title="Undo (Ctrl+Z)">
                            <CornerUpLeft size={16}/>
                        </button>
                        <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">
                            <CornerUpRight size={16}/>
                        </button>
                    </div>
                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={() => setZoom(z => z + 0.1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"><ZoomIn size={16}/></button>
                        <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"><ZoomOut size={16}/></button>
                        <button onClick={() => { setZoom(1); setPan({x: 0, y: 0}); setRotation(0); }} className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 ml-1" title="Reset View"><RotateCcw size={16}/></button>
                    </div>
                </div>
            </div>

            {/* CANVAS */}
            <div 
                ref={containerRef}
                className="flex-1 cursor-grab active:cursor-grabbing relative overflow-hidden bg-[#f3f4f6] dark:bg-[#0f172a]"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={(e) => handleContextMenu(e)}
            >
                {/* TRANSFORM CONTAINER */}
                <div 
                    style={{ 
                        transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`, 
                        transformOrigin: '0 0', // CRITICAL for correct math
                        width: '100%', height: '100%',
                        position: 'absolute', top: 0, left: 0,
                        pointerEvents: 'none' // Let events pass to SVG/Nodes, but container itself is transparent
                    }}
                >
                    {/* SVG Layer for Links */}
                    <svg className="overflow-visible w-full h-full absolute top-0 left-0 pointer-events-none">
                        {links.map(renderLink)}
                        {/* Dragging Line */}
                        {isConnectMode && connectSourceId && (
                            <line 
                                x1={nodes.find(n => n.id === connectSourceId)?.x || 0}
                                y1={nodes.find(n => n.id === connectSourceId)?.y || 0}
                                x2={mousePos.x} y2={mousePos.y}
                                stroke="#9ca3af" strokeWidth={2} strokeDasharray="5,5"
                            />
                        )}
                    </svg>

                    {/* Nodes Layer */}
                    {nodes.map(node => (
                        <div
                            key={node.id}
                            className="absolute pointer-events-auto flex items-center justify-center group"
                            style={{ 
                                left: node.x, top: node.y, 
                                transform: `translate(-50%, -50%) rotate(${-rotation}deg)`, // Counter-rotate nodes to keep upright
                                zIndex: 10
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            onMouseEnter={() => { setHoveredNodeId(node.id); }}
                            onMouseLeave={() => { setHoveredNodeId(null); }}
                            onContextMenu={(e) => handleContextMenu(e, node.id, 'node')}
                        >
                            {/* Label: Top-Left (Above Cable) */}
                            <div className="absolute bottom-3 right-3 mb-1 mr-1 pointer-events-none whitespace-nowrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border ${node.id === hoveredNodeId ? 'bg-blue-600 text-white' : 'bg-white/90 text-gray-700 dark:bg-gray-800 dark:text-white dark:border-gray-600 border-gray-200'}`}>
                                    {node.label}
                                </span>
                            </div>

                            {/* Node Point */}
                            <div 
                                className={`rounded-full border-2 border-white dark:border-gray-800 shadow-md transition-all ${hoveredNodeId === node.id ? 'ring-4 ring-blue-200 scale-125' : ''}`}
                                style={{ 
                                    backgroundColor: node.color || '#3b82f6',
                                    width: '16px', height: '16px'
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* CONTEXT MENU */}
            {contextMenu.visible && (
                <div 
                    className="fixed z-[100] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 w-56 text-sm animate-scale-in"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={(e) => e.stopPropagation()} 
                >
                    {contextMenu.type === 'node' && (
                        <>
                            <button onClick={() => executeAction('rename')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium">Rename Node</button>
                            <button onClick={() => executeAction('add_connections')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Add Connections</button>
                            <button onClick={() => executeAction('add_clients')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold flex items-center gap-2"><User size={14}/> Add Clients</button>
                            <button onClick={() => executeAction('connect')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Connect Line</button>
                            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                            <button onClick={() => executeAction('assign_items')} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-blue-600 font-bold">Assign Inventory</button>
                            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                            <button onClick={() => executeAction('delete')} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">Delete Node</button>
                        </>
                    )}
                    {contextMenu.type === 'link' && (
                        <>
                            <button onClick={() => executeAction('edit_cable')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium">Edit Cable Info</button>
                            <button onClick={() => executeAction('delete_link')} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">Delete Link</button>
                        </>
                    )}
                    {contextMenu.type === 'canvas' && (
                        <button onClick={() => executeAction('add_node_here')} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 font-bold text-brand-600">Add Node Here</button>
                    )}
                </div>
            )}

            {/* MODALS */}
            {activeModal === 'rename' && (
                <Modal title="Rename Node" onClose={() => setActiveModal('none')}>
                    <input 
                        className="w-full border p-2 rounded mb-4" 
                        value={tempData.label || ''} 
                        onChange={e => setTempData({...tempData, label: e.target.value})} 
                        onKeyDown={e => e.key === 'Enter' && submitRename()}
                        autoFocus 
                    />
                    <button onClick={submitRename} className="w-full bg-blue-600 text-white py-2 rounded">Save</button>
                </Modal>
            )}

            {activeModal === 'edit_cable' && (
                <Modal title="Edit Cable Details" onClose={() => setActiveModal('none')}>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Label (Port)</label>
                            <input 
                                className="w-full border p-2 rounded" 
                                value={tempData.label || ''} 
                                onChange={e => setTempData({...tempData, label: e.target.value})} 
                                placeholder="e.g. Port 1" 
                                onKeyDown={e => e.key === 'Enter' && submitCableEdit()}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Length</label>
                            <input 
                                className="w-full border p-2 rounded" 
                                value={tempData.length || ''} 
                                onChange={e => setTempData({...tempData, length: e.target.value})} 
                                placeholder="e.g. 150m" 
                                onKeyDown={e => e.key === 'Enter' && submitCableEdit()}
                            />
                        </div>
                        <button onClick={submitCableEdit} className="w-full bg-blue-600 text-white py-2 rounded">Update</button>
                    </div>
                </Modal>
            )}

            {activeModal === 'fanout' && (
                <Modal title="Add Connections" onClose={() => setActiveModal('none')}>
                    <label className="block text-xs font-bold text-gray-500 mb-2">Number of Nodes</label>
                    <input 
                        type="number" 
                        className="w-full border p-2 rounded mb-4 text-lg font-bold" 
                        value={tempData.count || 1} 
                        onChange={e => setTempData({...tempData, count: e.target.value})} 
                        onKeyDown={e => e.key === 'Enter' && submitFanOut()}
                        autoFocus 
                    />
                    <button onClick={submitFanOut} className="w-full bg-green-600 text-white py-2 rounded">Create Nodes</button>
                </Modal>
            )}

            {/* Add Clients Modal with Search */}
            {activeModal === 'add_client' && (
                <Modal title="Select Client to Connect" onClose={() => setActiveModal('none')}>
                    <div className="space-y-4">
                        <div className="relative">
                            <input 
                                className="w-full border pl-8 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-white dark:border-gray-600 outline-none"
                                placeholder="Search clients..."
                                onChange={e => setTempData({...tempData, search: e.target.value})}
                                autoFocus
                            />
                            <Search size={14} className="absolute left-3 top-3 text-gray-400"/>
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar border rounded-lg dark:border-gray-700">
                            {state.clients
                                .filter(c => !tempData.search || c.name.toLowerCase().includes(tempData.search.toLowerCase()) || c.username.toLowerCase().includes(tempData.search.toLowerCase()))
                                .slice(0, 50)
                                .map(client => (
                                    <div 
                                        key={client.id} 
                                        className="p-3 border-b dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex justify-between items-center"
                                        onClick={() => submitAddClient(client)}
                                    >
                                        <div>
                                            <p className="font-bold text-sm text-gray-800 dark:text-white">{client.name}</p>
                                            <p className="text-xs text-gray-500">{client.username} | {client.area}</p>
                                        </div>
                                        <Plus size={16} className="text-brand-600" />
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </Modal>
            )}

            {activeModal === 'assign' && (
                <Modal title="Assign from Inventory" onClose={() => setActiveModal('none')}>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                        {state.inventory.filter(i => i.stockCount > 0).map(item => (
                            <div key={item.id} className="flex justify-between items-center p-3 border-b hover:bg-gray-50 cursor-pointer" onClick={() => submitAssign(item)}>
                                <div>
                                    <p className="font-bold text-sm">{item.name}</p>
                                    <p className="text-xs text-gray-500">{item.type}</p>
                                </div>
                                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold">{item.stockCount} left</span>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
};

// Simple Modal Wrapper for Diagram
const Modal = ({ title, onClose, children }: any) => (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-80 animate-scale-in">
            <div className="flex justify-between items-center mb-4 border-b pb-2 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h2>
                <button onClick={onClose}><X size={18} className="text-gray-400"/></button>
            </div>
            {children}
        </div>
    </div>
);
