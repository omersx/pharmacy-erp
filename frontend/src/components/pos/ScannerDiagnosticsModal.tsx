'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ScanBarcode, CheckCircle2, AlertTriangle, HelpCircle, Laptop, Radio, Keyboard, RefreshCw } from 'lucide-react';
import type { BarcodeKeyDebug } from '@/hooks/use-barcode-scanner';

interface ScannerDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestScan: (code: string) => void;
  lastScannedCode?: string;
  lastDebugEvent?: BarcodeKeyDebug | null;
}

export function ScannerDiagnosticsModal({
  isOpen,
  onClose,
  onTestScan,
  lastScannedCode,
  lastDebugEvent,
}: ScannerDiagnosticsModalProps) {
  const [testInput, setTestInput] = useState('');
  const [keyLog, setKeyLog] = useState<BarcodeKeyDebug[]>([]);
  const testInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      testInputRef.current?.focus();
      setKeyLog([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lastDebugEvent) {
      setKeyLog((prev) => [lastDebugEvent, ...prev.slice(0, 19)]);
    }
  }, [lastDebugEvent]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pos-500/10 border border-pos-500/20 text-pos-500 flex items-center justify-center">
              <ScanBarcode size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Bluetooth & USB Scanner Diagnostics</h2>
              <p className="text-xs text-foreground/60">Live hardware input monitor and connection troubleshooting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Live Test Area */}
          <div className="bg-surface rounded-xl p-4 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-pos-500">Live Hardware Test</span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Listening for Keystrokes
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-foreground/70">
                Point your scanner and scan any barcode directly into this box:
              </label>
              <div className="flex gap-2">
                <input
                  ref={testInputRef}
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && testInput.trim()) {
                      e.preventDefault();
                      onTestScan(testInput.trim());
                      setTestInput('');
                    }
                  }}
                  placeholder="Scan here... (or pull trigger anywhere in POS)"
                  className="flex-1 bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground focus:outline-none focus:border-pos-500 focus:ring-1 focus:ring-pos-500 font-mono"
                />
                <button
                  onClick={() => {
                    if (testInput.trim()) {
                      onTestScan(testInput.trim());
                      setTestInput('');
                    }
                  }}
                  className="px-4 py-2 bg-pos-500 text-white rounded-lg text-xs font-semibold hover:bg-pos-600 transition-colors"
                >
                  Test Lookup
                </button>
              </div>
            </div>

            {/* Live Key Log Feed */}
            <div className="pt-2">
              <div className="text-[11px] font-medium text-foreground/50 mb-1 flex justify-between">
                <span>Recent Keystroke Stream (Raw Hardware Input):</span>
                {keyLog.length > 0 && (
                  <button
                    onClick={() => setKeyLog([])}
                    className="text-[10px] text-foreground/40 hover:text-foreground flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Clear
                  </button>
                )}
              </div>
              <div className="bg-black/30 dark:bg-black/60 rounded-lg p-2.5 font-mono text-xs max-h-24 overflow-y-auto border border-border/50">
                {keyLog.length === 0 ? (
                  <div className="text-foreground/40 text-center py-2 italic text-xs">
                    No scanner keystrokes detected yet. Pull the scanner trigger to test.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {keyLog.map((k, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-emerald-400 font-bold">Key: &apos;{k.key}&apos;</span>
                        <span className="text-foreground/60">{k.code}</span>
                        <span className="text-amber-400">Δ {k.timeDiff}ms</span>
                        <span className="text-foreground/40">{k.timestamp}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Troubleshooting Checklist */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/70 flex items-center gap-1.5">
              <HelpCircle size={14} className="text-brand-500" />
              If your scanner beeps but nothing is received:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Check 1 */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Laptop size={14} className="text-blue-500" />
                  <span>1. Check Windows Bluetooth</span>
                </div>
                <p className="text-foreground/60 leading-relaxed">
                  Go to <strong className="text-foreground">Windows Settings → Bluetooth & devices</strong>. Verify your scanner is listed as <strong className="text-foreground">&ldquo;Connected as Input / Keyboard&rdquo;</strong>.
                </p>
              </div>

              {/* Check 2 */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Keyboard size={14} className="text-emerald-500" />
                  <span>2. Check Scanner HID Mode</span>
                </div>
                <p className="text-foreground/60 leading-relaxed">
                  Bluetooth scanners have 2 modes: <strong className="text-foreground">HID (Keyboard)</strong> and <strong className="text-foreground">SPP (Serial)</strong>. If set to SPP, Windows won&apos;t type. Scan the <strong className="text-foreground">&ldquo;Bluetooth HID Mode&rdquo;</strong> barcode in your scanner manual.
                </p>
              </div>

              {/* Check 3 */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Radio size={14} className="text-purple-500" />
                  <span>3. Instant Upload vs Storage</span>
                </div>
                <p className="text-foreground/60 leading-relaxed">
                  If the scanner beeps and saves barcodes to internal memory instead of sending them, scan the <strong className="text-foreground">&ldquo;Instant Upload / Normal Mode&rdquo;</strong> barcode from its user manual.
                </p>
              </div>

              {/* Check 4 */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <CheckCircle2 size={14} className="text-amber-500" />
                  <span>4. Quick Test in Windows Notepad</span>
                </div>
                <p className="text-foreground/60 leading-relaxed">
                  Press <kbd className="px-1 py-0.5 bg-background rounded border border-border text-[10px]">Win + R</kbd>, type <code className="text-foreground">notepad</code>, and scan. If digits type into Notepad, the scanner is 100% working with Windows.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border bg-surface/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-surface hover:bg-background border border-border text-foreground text-xs font-semibold rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
