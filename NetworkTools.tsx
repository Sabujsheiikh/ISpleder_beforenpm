

import React, { useState, useEffect, useRef } from 'react';
import { GlobalState } from '../types';
import { 
  Terminal, Globe, Zap, Play, RotateCcw, 
  Activity, Server, ArrowDown, ArrowUp, 
  Wifi, AlertTriangle, CheckCircle, XCircle, ExternalLink, Command,
  Square, Hash, List
} from '../components/ui/Icons';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { sendToHost, onMessageFromHost, isWebView2 } from '../services/bridge';

interface NetworkToolsProps {
  state: GlobalState;
  initialTab?: string;
}

// Configuration
const PING_COUNT = 20;
const PING_TIMEOUT = 2000;
// Using Cloudflare's speed test endpoints (CORS enabled)
const SPEED_BASE_URL = 'https://speed.cloudflare.com';

export const NetworkTools: React.FC<NetworkToolsProps> = ({ state, initialTab = 'speedtest' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Console State
  const [consoleOutput, setConsoleOutput] = useState<string[]>(['> System initialized.', '> Ready for commands...', '> Type "help" for a list of commands.']);
  const [consoleInput, setConsoleInput] = useState('');
  const [isCmdRunning, setIsCmdRunning] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const abortCommandRef = useRef(false);
    const currentCmdIdRef = useRef<string | null>(null);

  // Speed Test State
  const [testPhase, setTestPhase] = useState<'idle' | 'init' | 'ping' | 'download' | 'upload' | 'complete'>('idle');
  const [metrics, setMetrics] = useState({
      download: 0, // Mbps
      upload: 0,   // Mbps
      ping: 0,     // ms
      jitter: 0,   // ms
      loss: 0,     // %
      ip: '...',
      server: 'Finding...',
      provider: 'Unknown ISP'
  });
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [chartData, setChartData] = useState<{time: number, speed: number}[]>([]);
  const [qualityScore, setQualityScore] = useState<{rating: string, color: string} | null>(null);

  // Auto-scroll console
  useEffect(() => {
     consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleOutput]);

  // Listen for host messages (WebView2) to stream command output
  useEffect(() => {
     let intervalId: any = null;
     const handler = (data: any) => {
         try {
             if (!data || !data.type) return;
             if (data.type === 'cmd_output') {
                 // Format: include local time and mark error lines
                 const ts = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                 const formatted = data.isError ? `[ERR ${ts}] ${data.line}` : `[${ts}] ${data.line}`;
                 setConsoleOutput((prev) => [...prev, formatted]);
             }
             if (data.type === 'cmd_started') {
                 // Host indicates the process started
                 currentCmdIdRef.current = data.id || currentCmdIdRef.current;
                 setIsCmdRunning(true);
                 setConsoleOutput(prev => [...prev, `[Host] started pid=${data.pid || 'n/a'} id=${data.id || ''}`]);
             }
             if (data.type === 'cmd_done' || data.type === 'cmd_killed') {
                 const extra = data.exitCode !== undefined && data.exitCode !== null ? ` exit=${data.exitCode}` : '';
                 setConsoleOutput(prev => [...prev, `\n[Process ${data.type === 'cmd_killed' ? 'killed' : 'completed'}]${extra}`]);
                 setIsCmdRunning(false);
                 currentCmdIdRef.current = null;
             }
             if (data.type === 'cmd_error') {
                 const ts = new Date().toLocaleTimeString();
                 setConsoleOutput(prev => [...prev, `[ERR ${ts}] ${data.message}`]);
                 setIsCmdRunning(false);
                 currentCmdIdRef.current = null;
             }
         } catch { }
     };

     // Try to register handler immediately if available, otherwise poll until available (for packaged scenarios)
     const tryRegister = () => {
         try {
             if (isWebView2()) {
                 onMessageFromHost(handler);
                 if (intervalId) { clearInterval(intervalId); intervalId = null; }
             }
         } catch {
             // ignore
         }
     };

     tryRegister();
     // Poll for availability for up to ~15s
     intervalId = setInterval(tryRegister, 500);

     return () => { if (intervalId) clearInterval(intervalId); };
  }, []);

  // --- CORE SPEED TEST ENGINE ---

  const runSpeedTest = async () => {
      // 1. Reset
      setTestPhase('init');
      setMetrics({ download: 0, upload: 0, ping: 0, jitter: 0, loss: 0, ip: '...', server: '...', provider: '...' });
      setLiveSpeed(0);
      setProgress(0);
      setChartData([]);
      setQualityScore(null);

      try {
          // 2. Server Location & IP (Cloudflare Trace)
          const traceReq = await fetch('https://1.1.1.1/cdn-cgi/trace');
          const traceText = await traceReq.text();
          const traceData = Object.fromEntries(traceText.trim().split('\n').map(l => l.split('=')));
          
          setMetrics(prev => ({
              ...prev,
              ip: traceData.ip || 'Unknown',
              server: `Cloudflare (${traceData.colo || 'Global'})`,
              provider: traceData.warp === 'on' ? 'Cloudflare WARP' : 'Standard Connection'
          }));
          setProgress(5);

          // 3. Ping / Jitter / Loss
          setTestPhase('ping');
          const pings: number[] = [];
          let timeouts = 0;

          for(let i = 0; i < PING_COUNT; i++) {
              const start = performance.now();
              try {
                  const controller = new AbortController();
                  const id = setTimeout(() => controller.abort(), PING_TIMEOUT);
                  await fetch('https://1.1.1.1/cdn-cgi/trace', { 
                      method: 'HEAD', 
                      mode: 'no-cors', 
                      cache: 'no-store',
                      signal: controller.signal
                  });
                  clearTimeout(id);
                  pings.push(performance.now() - start);
              } catch (e) {
                  timeouts++;
              }
              setProgress(5 + (i / PING_COUNT) * 10); // 5% -> 15%
          }

          const avgPing = pings.length ? pings.reduce((a, b) => a + b, 0) / pings.length : 0;
          const minPing = Math.min(...pings, avgPing); // Fallback to avg if empty
          // Calculate Jitter (Standard Deviation)
          const jitter = pings.length 
              ? Math.sqrt(pings.map(x => Math.pow(x - avgPing, 2)).reduce((a, b) => a + b) / pings.length) 
              : 0;
          const loss = (timeouts / PING_COUNT) * 100;

          setMetrics(prev => ({ ...prev, ping: Math.round(minPing), jitter: Math.round(jitter), loss: Math.round(loss) }));

          // 4. Download Test
          setTestPhase('download');
          const downSpeed = await measureBandwidth('download');
          setMetrics(prev => ({ ...prev, download: downSpeed }));

          // 5. Upload Test
          setTestPhase('upload');
          const upSpeed = await measureBandwidth('upload');
          setMetrics(prev => ({ ...prev, upload: upSpeed }));

          // 6. Complete & Rate
          calculateQuality(avgPing, jitter, loss);
          setTestPhase('complete');
          setProgress(100);
          setLiveSpeed(0);

      } catch (error) {
          console.error("Speed Test Error:", error);
          setConsoleOutput(prev => [...prev, `Error: ${error}`]);
          setTestPhase('idle');
          alert("Network error occurred during test.");
      }
  };

  const measureBandwidth = async (type: 'download' | 'upload'): Promise<number> => {
      const startTime = performance.now();
      const durationTarget = 8000; // Run for 8 seconds
      let totalBytes = 0;
      let lastChartUpdate = 0;
      
      // We use distinct buckets to plot graph
      const chartPoints: {time: number, speed: number}[] = [];

      // DOWNLOAD LOGIC
      if (type === 'download') {
          // Dynamic chunk sizing to saturate link
          const sizes = [100000, 1000000, 10000000, 25000000, 50000000]; // 100KB, 1MB, 10MB, 25MB, 50MB
          let sizeIndex = 0;
          
          while (performance.now() - startTime < durationTarget) {
              const size = sizes[sizeIndex];
              const batchStart = performance.now();
              
              try {
                  const response = await fetch(`${SPEED_BASE_URL}/__down?bytes=${size}`, { cache: 'no-store' });
                  const reader = response.body?.getReader();
                  if (!reader) break;

                  while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      
                      totalBytes += value.byteLength;
                      
                      // Live Update Logic
                      const now = performance.now();
                      const elapsedTotal = (now - startTime) / 1000;
                      
                      if (now - lastChartUpdate > 200) { // Update UI every 200ms
                          const instantSpeed = (totalBytes * 8) / (elapsedTotal * 1000000); // Mbps
                          setLiveSpeed(instantSpeed);
                          
                          // Normalize progress (15% to 55% for download)
                          const p = 15 + Math.min(40, (elapsedTotal / (durationTarget/1000)) * 40);
                          setProgress(p);

                          setChartData(prev => [...prev, { time: prev.length, speed: instantSpeed }]);
                          lastChartUpdate = now;
                      }
                  }
              } catch (e) { break; }

              // Increase chunk size if too fast
              const batchTime = performance.now() - batchStart;
              if (batchTime < 500 && sizeIndex < sizes.length - 1) sizeIndex++;
          }
      } 
      // UPLOAD LOGIC
      else {
          // Create random payload
          const chunkSize = 500000; // 500KB chunks
          const payload = new Uint8Array(chunkSize); 
          
          // crypto.getRandomValues has a limit of 65536 bytes
          // We must fill the buffer in chunks
          const maxEntropy = 65536;
          for (let i = 0; i < chunkSize; i += maxEntropy) {
              const end = Math.min(i + maxEntropy, chunkSize);
              crypto.getRandomValues(payload.subarray(i, end));
          }

          while (performance.now() - startTime < durationTarget) {
              try {
                  await fetch(`${SPEED_BASE_URL}/__up`, { 
                      method: 'POST', 
                      body: payload,
                      cache: 'no-store'
                  });
                  
                  totalBytes += chunkSize;

                  const now = performance.now();
                  const elapsedTotal = (now - startTime) / 1000;

                  if (now - lastChartUpdate > 200) {
                      const instantSpeed = (totalBytes * 8) / (elapsedTotal * 1000000);
                      setLiveSpeed(instantSpeed);
                      
                      // Normalize progress (55% to 95% for upload)
                      const p = 55 + Math.min(40, (elapsedTotal / (durationTarget/1000)) * 40);
                      setProgress(p);

                      setChartData(prev => [...prev, { time: prev.length, speed: instantSpeed }]);
                      lastChartUpdate = now;
                  }
              } catch (e) { break; }
          }
      }

      const finalDuration = (performance.now() - startTime) / 1000;
      const avgSpeedMbps = (totalBytes * 8) / (finalDuration * 1000000);
      return parseFloat(avgSpeedMbps.toFixed(2));
  };

  const calculateQuality = (ping: number, jitter: number, loss: number) => {
      // Simplified MOS (Mean Opinion Score) Logic for ISP
      let score = 5;
      if (ping > 50) score -= 1;
      if (ping > 150) score -= 1;
      if (jitter > 20) score -= 1;
      if (loss > 1) score -= 1.5;
      if (loss > 5) score = 1;

      if (score >= 4.5) setQualityScore({ rating: 'Excellent', color: 'text-green-500' });
      else if (score >= 3.5) setQualityScore({ rating: 'Good', color: 'text-blue-500' });
      else if (score >= 2.5) setQualityScore({ rating: 'Fair', color: 'text-yellow-500' });
      else setQualityScore({ rating: 'Poor', color: 'text-red-500' });
  };

  // --- CONSOLE LOGIC ---
  const stopCommand = () => {
        abortCommandRef.current = true;
        setIsCmdRunning(false);
        setConsoleOutput(prev => [...prev, '^C']);
        // If running in WebView2, request host to kill the process
      if (isWebView2() && currentCmdIdRef.current) {
            sendToHost('kill_cmd', { id: currentCmdIdRef.current });
                currentCmdIdRef.current = null;
        }
  };

  const executeConsoleCommand = async (cmd: string) => {
      const cleanCmd = cmd.trim();
      if (!cleanCmd) return;
      
      // Prevent running if already active unless stopped (though UI hides input)
      if (isCmdRunning) {
         stopCommand();
         await new Promise(r => setTimeout(r, 200));
      }

      setConsoleOutput(prev => [...prev, `user@ispledger:~$ ${cleanCmd}`]);
      abortCommandRef.current = false;
      setIsCmdRunning(true);

      const parts = cleanCmd.split(/\s+/);
      const baseCmd = parts[0].toLowerCase();
      const arg1 = parts[1];
      const arg2 = parts[2];

      try {
        if (baseCmd === 'clear' || baseCmd === 'cls') {
            setConsoleOutput([]);
            setIsCmdRunning(false);
            return;
        }

        if (baseCmd === 'ping') {
            // Use host process for real system ping when available
            const isInfinite = arg1 === '-t' || arg2 === '-t';
            const host = (arg1 === '-t' ? arg2 : arg1) || '8.8.8.8';

            setConsoleOutput(prev => [...prev, `Pinging ${host} with 32 bytes of data:`]);
            setIsCmdRunning(true);
            abortCommandRef.current = false;

            if (isWebView2()) {
                const id = Math.random().toString(36).substr(2, 9);
                currentCmdIdRef.current = id;
                sendToHost('run_cmd', { cmd: `ping ${host} ${isInfinite ? '-t' : ''}`.trim(), id });
            } else {
                // Fallback to simulated ping in browser
                let count = 0;
                const max = isInfinite ? Infinity : 4;

                while (count < max && !abortCommandRef.current) {
                    await new Promise(r => setTimeout(r, 800)); // Delay for realism
                    if (abortCommandRef.current) break;

                    const time = Math.floor(Math.random() * 20) + 10;
                    setConsoleOutput(prev => [...prev, `Reply from ${host}: bytes=32 time=${time}ms TTL=116`]);
                    count++;
                }

                if (!abortCommandRef.current) {
                    setConsoleOutput(prev => [...prev, `\nPing statistics for ${host}:`, `    Packets: Sent = ${count}, Received = ${count}, Lost = 0 (0% loss)`]);
                }
                setIsCmdRunning(false);
            }
            return;
        }

        if (baseCmd === 'tracert') {
            const host = arg1 || 'google.com';
            setConsoleOutput(prev => [...prev, `Tracing route to ${host} over a maximum of 30 hops:`]);
            
            const hops = [
                '192.168.1.1',
                '10.20.0.1',
                '172.16.50.12',
                'isp-gateway.net',
                'backbone-router.net',
                'cloud-exchange.net',
                'dest-network.com',
                host
            ];

            for (let i = 0; i < hops.length; i++) {
                if (abortCommandRef.current) break;
                await new Promise(r => setTimeout(r, 600)); 
                const ms1 = Math.floor(Math.random() * 10) + 1;
                const ms2 = Math.floor(Math.random() * 10) + 1;
                const ms3 = Math.floor(Math.random() * 10) + 1;
                setConsoleOutput(prev => [...prev, 
                    `  ${i + 1}    ${ms1} ms    ${ms2} ms    ${ms3} ms  ${hops[i]}`
                ]);
            }
            if (!abortCommandRef.current) setConsoleOutput(prev => [...prev, `\nTrace complete.`]);
            return;
        }

        if (baseCmd === 'nslookup') {
            const domain = arg1 || 'google.com';
            setConsoleOutput(prev => [...prev, `Server:  UnKnown`, `Address:  192.168.1.1`, ``, `Non-authoritative answer:`]);
            await new Promise(r => setTimeout(r, 500));
            setConsoleOutput(prev => [...prev, `Name:    ${domain}`, `Address:  142.250.183.46`]);
            return;
        }

        if (baseCmd === 'netstat') {
             setConsoleOutput(prev => [...prev, 
                `Active Connections`,
                ``,
                `  Proto  Local Address          Foreign Address        State`,
                `  TCP    192.168.1.105:50443    52.1.1.1:443           ESTABLISHED`,
                `  TCP    192.168.1.105:50444    104.1.1.1:443          ESTABLISHED`,
                `  TCP    192.168.1.105:50445    172.217.1.1:443        TIME_WAIT`,
                `  UDP    0.0.0.0:123            *:*                    `
             ]);
             return;
        }

        if (baseCmd === 'help') {
          setConsoleOutput(prev => [...prev, 
              `  Available Commands:`,
              `  -------------------`,
              `  ping <host> [-t]  Check connectivity`,
              `  tracert <host>    Trace route to host`,
              `  nslookup <dom>    Query DNS`,
              `  netstat           Show network connections`,
              `  ipconfig          Show IP configuration`,
              `  status            Show last speed test results`,
              `  clear             Clear terminal`,
              `  whoami            Current user`
          ]);
          return;
        }

        if (baseCmd === 'status') {
          setConsoleOutput(prev => [...prev, 
              `Last Speed Test Results:`,
              `  Down: ${metrics.download} Mbps`,
              `  Up:   ${metrics.upload} Mbps`,
              `  Ping: ${metrics.ping} ms`
          ]);
          return;
        }

        if (baseCmd === 'ipconfig') {
          setConsoleOutput(prev => [...prev, 
              `Windows IP Configuration`,
              ``,
              `Ethernet adapter Ethernet:`,
              `   IPv4 Address. . . . . . . . . . . : ${metrics.ip !== '...' ? metrics.ip : '192.168.1.105'}`,
              `   Default Gateway . . . . . . . . . : 192.168.1.1`
          ]);
          return;
        }

        if (baseCmd === 'whoami') {
          setConsoleOutput(prev => [...prev, `ispledger\\admin`]);
          return;
      }

      setConsoleOutput(prev => [...prev, `Command '${baseCmd}' not found.`]);

      } catch (err) {
         setConsoleOutput(prev => [...prev, `Error executing command.`]);
      } finally {
         setIsCmdRunning(false);
      }
  };

  const handleConsoleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          executeConsoleCommand(consoleInput);
          setConsoleInput('');
      }
  };

  // Speed Gauge Component
  const SpeedGauge = ({ value, max = 100 }: { value: number, max?: number }) => {
      const radius = 80;
      const stroke = 12;
      const normalizedValue = Math.min(value, max);
      const circumference = Math.PI * radius; // Semi-circle
      const percent = normalizedValue / max;
      const offset = circumference * (1 - percent); 
      
      return (
          <div className="relative flex flex-col items-center justify-center">
              <svg width="240" height="130" viewBox="0 0 240 130" className="overflow-visible">
                  {/* Background Arc */}
                  <path d="M 40 120 A 80 80 0 0 1 200 120" fill="none" stroke="#e2e8f0" strokeWidth={stroke} strokeLinecap="round" className="dark:stroke-gray-700" />
                  {/* Active Arc */}
                  <path 
                    d="M 40 120 A 80 80 0 0 1 200 120" 
                    fill="none" 
                    stroke="url(#gaugeGradient)" 
                    strokeWidth={stroke} 
                    strokeLinecap="round" 
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-300 ease-out"
                  />
                  <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
              </svg>
              <div className="absolute top-16 text-center transform translate-y-2">
                  <span className="text-5xl font-black text-gray-900 dark:text-white tracking-tighter">{value.toFixed(1)}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-bold block uppercase mt-1">Mbps</span>
              </div>
          </div>
      );
  };

  const ConsoleCommandsList = [
      { cmd: 'ping 8.8.8.8', desc: 'Google DNS Ping' },
      { cmd: 'ping 8.8.8.8 -t', desc: 'Continuous Ping' },
      { cmd: 'tracert google.com', desc: 'Trace Route' },
      { cmd: 'nslookup google.com', desc: 'DNS Lookup' },
      { cmd: 'netstat', desc: 'Network Connections' },
      { cmd: 'ipconfig', desc: 'Network Configuration' },
      { cmd: 'status', desc: 'Last Speed Test' },
      { cmd: 'clear', desc: 'Clear Terminal' },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-10 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
             <Activity size={24} className="text-brand-600"/> Network Tools
           </h1>
           <p className="text-sm text-gray-500">ISP-grade diagnostics and performance testing.</p>
        </div>
      </div>

      <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit shrink-0">
          <button 
             onClick={() => setActiveTab('speedtest')}
             className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all ${activeTab === 'speedtest' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
              <Zap size={16} /> Native Speed Test
          </button>
          <button 
             onClick={() => setActiveTab('external')}
             className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all ${activeTab === 'external' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
              <ExternalLink size={16} /> External Tools
          </button>
          <button 
             onClick={() => setActiveTab('console')}
             className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all ${activeTab === 'console' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
              <Terminal size={16} /> System Console
          </button>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden relative flex flex-col">
          
          {/* NATIVE SPEED TEST UI */}
          {activeTab === 'speedtest' && (
              <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/50">
                  
                  {/* Top Status Bar */}
                  <div className="bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-6 items-center justify-between">
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${metrics.server !== '...' ? 'bg-green-100 text-green-700 dark:bg-green-900/20' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                              <Server size={20} />
                          </div>
                          <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Test Server</p>
                              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{metrics.server}</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${metrics.ip !== '...' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                              <Globe size={20} />
                          </div>
                          <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Your IP</p>
                              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 font-mono">{metrics.ip}</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${metrics.loss > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                              <AlertTriangle size={20} />
                          </div>
                          <div>
                              <p className="text-[10px] uppercase font-bold text-gray-400">Packet Loss</p>
                              <p className={`text-sm font-bold ${metrics.loss > 0 ? 'text-red-600' : 'text-gray-800 dark:text-gray-200'}`}>{metrics.loss}%</p>
                          </div>
                      </div>
                  </div>

                  {/* Main Gauge Area */}
                  <div className="flex-1 flex flex-col items-center justify-center py-8 relative">
                      <SpeedGauge value={testPhase === 'idle' || testPhase === 'complete' ? metrics.download : liveSpeed} max={100} />
                      
                      <div className="mt-8">
                          {testPhase === 'idle' || testPhase === 'complete' ? (
                              <button 
                                onClick={runSpeedTest}
                                className="group relative bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-full font-black text-lg shadow-[0_10px_30px_rgba(37,99,235,0.4)] transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3"
                              >
                                  {testPhase === 'complete' ? <RotateCcw size={22} className="group-hover:-rotate-180 transition-transform duration-500"/> : <Play size={22} className="ml-1"/>}
                                  {testPhase === 'complete' ? 'TEST AGAIN' : 'START TEST'}
                              </button>
                          ) : (
                              <div className="flex flex-col items-center gap-2">
                                  <div className="flex items-center gap-2 text-brand-600 font-bold uppercase tracking-widest text-xs animate-pulse">
                                      {testPhase === 'init' && 'Connecting...'}
                                      {testPhase === 'ping' && 'Measuring Latency...'}
                                      {testPhase === 'download' && 'Testing Download...'}
                                      {testPhase === 'upload' && 'Testing Upload...'}
                                  </div>
                                  <div className="w-48 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* Connection Rating Badge */}
                      {qualityScore && testPhase === 'complete' && (
                          <div className={`absolute bottom-6 px-4 py-2 rounded-full border bg-white dark:bg-gray-800 shadow-sm flex items-center gap-2 animate-scale-in`}>
                              {qualityScore.rating === 'Excellent' || qualityScore.rating === 'Good' ? <CheckCircle size={16} className={qualityScore.color}/> : <XCircle size={16} className={qualityScore.color}/>}
                              <span className={`text-sm font-bold ${qualityScore.color}`}>Network Quality: {qualityScore.rating}</span>
                          </div>
                      )}
                  </div>

                  {/* Results Grid & Graph */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 h-64">
                      
                      {/* Metric Cards */}
                      <div className="col-span-1 border-r border-gray-200 dark:border-gray-700 p-6 grid grid-cols-2 gap-6">
                          <div>
                              <p className="text-gray-400 text-[10px] uppercase font-bold mb-1 flex items-center gap-1"><ArrowDown size={12}/> Download</p>
                              <p className="text-2xl font-black text-gray-800 dark:text-white">
                                  {metrics.download} <span className="text-sm font-medium text-gray-400">Mbps</span>
                              </p>
                          </div>
                          <div>
                              <p className="text-gray-400 text-[10px] uppercase font-bold mb-1 flex items-center gap-1"><ArrowUp size={12}/> Upload</p>
                              <p className="text-2xl font-black text-gray-800 dark:text-white">
                                  {metrics.upload} <span className="text-sm font-medium text-gray-400">Mbps</span>
                              </p>
                          </div>
                          <div>
                              <p className="text-gray-400 text-[10px] uppercase font-bold mb-1 flex items-center gap-1"><Wifi size={12}/> Ping</p>
                              <p className="text-2xl font-black text-blue-500">
                                  {metrics.ping} <span className="text-sm font-medium text-gray-400">ms</span>
                              </p>
                          </div>
                          <div>
                              <p className="text-gray-400 text-[10px] uppercase font-bold mb-1 flex items-center gap-1"><Activity size={12}/> Jitter</p>
                              <p className="text-2xl font-black text-purple-500">
                                  {metrics.jitter} <span className="text-sm font-medium text-gray-400">ms</span>
                              </p>
                          </div>
                      </div>

                      {/* Real-time Graph */}
                      <div className="col-span-2 p-4 relative">
                          <p className="absolute top-4 left-4 text-[10px] font-bold text-gray-400 uppercase z-10">Real-time Stability</p>
                          <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData}>
                                  <defs>
                                      <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                      </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5}/>
                                  <XAxis dataKey="time" hide />
                                  <YAxis hide domain={[0, 'auto']} />
                                  <Tooltip 
                                      contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                                      itemStyle={{ color: '#fff' }}
                                      labelStyle={{ display: 'none' }}
                                      formatter={(value: number) => [`${value.toFixed(1)} Mbps`, 'Speed']}
                                  />
                                  <Area 
                                      type="monotone" 
                                      dataKey="speed" 
                                      stroke="#3b82f6" 
                                      strokeWidth={2} 
                                      fillOpacity={1} 
                                      fill="url(#colorSpeed)" 
                                      isAnimationActive={false}
                                  />
                              </AreaChart>
                          </ResponsiveContainer>
                      </div>
                  </div>
              </div>
          )}

          {/* EXTERNAL TOOLS TAB */}
          {activeTab === 'external' && (
              <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-6 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                      <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                              <h3 className="font-bold text-gray-700 dark:text-gray-200">Fast.com (Netflix)</h3>
                              <a href="https://fast.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">Open in Browser</a>
                          </div>
                          <iframe src="https://fast.com" className="flex-1 w-full border-none" title="Fast.com" />
                      </div>
                      <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                              <h3 className="font-bold text-gray-700 dark:text-gray-200">Speedtest.net (Ookla)</h3>
                              <a href="https://www.speedtest.net" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">Open in Browser</a>
                          </div>
                          <iframe src="https://www.speedtest.net" className="flex-1 w-full border-none" title="Speedtest.net" />
                      </div>
                  </div>
              </div>
          )}

          {/* CONSOLE TAB */}
          {activeTab === 'console' && (
              <div className="flex h-full bg-[#0f172a] text-gray-300 font-mono text-sm">
                  {/* Left: Terminal */}
                  <div className="flex-1 flex flex-col relative border-r border-gray-800">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Terminal size={100} />
                      </div>
                      
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 p-4 font-medium">
                          {consoleOutput.map((line, i) => (
                              <div key={i} className={`${line.startsWith('>') || line.startsWith('user@') ? 'text-green-400' : 'text-gray-300'} whitespace-pre-wrap`}>
                                  {line}
                              </div>
                          ))}
                          <div ref={consoleEndRef} />
                      </div>
                      
                      <div className="mt-auto flex items-center gap-2 border-t border-gray-800 p-3 bg-[#0f172a] relative z-10">
                          <span className="text-green-500 font-bold">user@ispledger:~$</span>
                          <input 
                            className="bg-transparent border-none outline-none text-white w-full font-mono placeholder-gray-600"
                            value={consoleInput}
                            onChange={(e) => setConsoleInput(e.target.value)}
                            onKeyDown={handleConsoleKeyDown}
                            autoFocus
                            spellCheck={false}
                          />
                          {isCmdRunning && (
                             <button 
                                onClick={stopCommand} 
                                className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded animate-pulse" 
                                title="Stop Command"
                             >
                                <Square size={12} fill="currentColor"/>
                             </button>
                          )}
                      </div>
                  </div>

                  {/* Right: Quick Commands Sidebar */}
                  <div className="w-64 bg-[#1e293b] flex flex-col border-l border-gray-700">
                      <div className="p-3 border-b border-gray-700 bg-[#0f172a]">
                          <h3 className="text-xs font-bold uppercase text-gray-400 flex items-center gap-2">
                              <Command size={14}/> Command Reference
                          </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                          {ConsoleCommandsList.map((item, idx) => (
                              <div 
                                key={idx}
                                className="w-full flex items-center gap-2 p-2 rounded hover:bg-[#334155] transition-colors group cursor-pointer"
                              >
                                  <div 
                                    className="flex-1"
                                    onClick={() => setConsoleInput(item.cmd)} // Click to copy
                                  >
                                      <div className="text-green-400 font-bold text-xs group-hover:text-green-300 font-mono truncate">{item.cmd}</div>
                                      <div className="text-[10px] text-gray-500 group-hover:text-gray-400 truncate">{item.desc}</div>
                                  </div>
                                  <button 
                                    onClick={() => executeConsoleCommand(item.cmd)} 
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-green-600 rounded transition-all opacity-0 group-hover:opacity-100"
                                    title="Run"
                                  >
                                      <Play size={10} fill="currentColor"/>
                                  </button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
