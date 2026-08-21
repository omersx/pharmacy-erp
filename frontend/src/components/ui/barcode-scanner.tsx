'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, SwitchCamera, Flashlight, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  /** Whether the scanner modal is open */
  isOpen: boolean;
  /** Called when the modal is closed */
  onClose: () => void;
  /** Called when a barcode/QR code is successfully scanned */
  onScan: (code: string) => void;
  /** Title shown at the top of the modal */
  title?: string;
}

/**
 * Camera-based barcode and QR code scanner modal.
 * 
 * Uses the `html5-qrcode` library to access the device camera and decode
 * barcodes in real-time. Supports EAN-13, EAN-8, UPC-A, Code-128, QR Code,
 * Data Matrix, and more.
 * 
 * Works on mobile (front/back camera), tablets, and desktop webcams.
 * 
 * @example
 * ```tsx
 * const [scannerOpen, setScannerOpen] = useState(false);
 * 
 * <BarcodeScanner
 *   isOpen={scannerOpen}
 *   onClose={() => setScannerOpen(false)}
 *   onScan={(code) => {
 *     console.log('Scanned:', code);
 *     setScannerOpen(false);
 *   }}
 * />
 * ```
 */
export function BarcodeScanner({ isOpen, onClose, onScan, title = 'Scan Barcode' }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!isOpen) return;
    
    setLoading(true);
    setError(null);
    hasScannedRef.current = false;

    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import('html5-qrcode');
    
    // Clean up any previous instance
    await stopScanner();

    // Wait for DOM to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const readerId = 'barcode-reader';
    const readerElement = document.getElementById(readerId);
    if (!readerElement) {
      setError('Scanner container not found');
      setLoading(false);
      return;
    }

    try {
      const scanner = new Html5Qrcode(readerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          // Prevent double scans
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;

          onScan(decodedText);
        },
        () => {
          // QR decode failure — this fires continuously, ignore
        }
      );

      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes('NotAllowedError') || err?.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err?.message?.includes('NotFoundError') || err?.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError(`Camera error: ${err?.message || 'Unknown error'}`);
      }
    }
  }, [isOpen, facingMode, onScan, stopScanner]);

  // Start scanner when modal opens
  useEffect(() => {
    if (isOpen) {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  // Toggle front/back camera
  const toggleCamera = useCallback(async () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-brand-500" />
            <h3 className="font-semibold text-foreground">{title}</h3>
          </div>
          <button
            onClick={() => { stopScanner(); onClose(); }}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors text-foreground/60 hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative bg-black">
          <div
            id="barcode-reader"
            ref={containerRef}
            className="w-full aspect-square"
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-3">
              <Loader2 size={32} className="animate-spin text-brand-500" />
              <p className="text-sm text-white/80">Starting camera...</p>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-3 p-6">
              <Camera size={48} className="text-red-400" />
              <p className="text-sm text-center text-red-300">{error}</p>
              <button
                onClick={startScanner}
                className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm hover:bg-brand-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Scan overlay frame */}
          {!loading && !error && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[250px] h-[250px] border-2 border-brand-500/50 rounded-lg">
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-brand-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-brand-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-brand-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-brand-400 rounded-br-lg" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-foreground/50">
            Point camera at barcode or QR code
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCamera}
              className="p-2 rounded-lg bg-surface hover:bg-border transition-colors text-foreground/70"
              title="Switch Camera"
            >
              <SwitchCamera size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
