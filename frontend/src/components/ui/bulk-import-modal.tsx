'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, X, File as FileIcon, AlertCircle, CheckCircle2, ChevronRight, FileSpreadsheet, Download, RefreshCw, FileText } from 'lucide-react';
import { Button } from './button';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useTranslations } from 'next-intl';

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type Step = 1 | 2 | 3;

interface ParsedRow {
  index: number;
  data: any;
  isValid: boolean;
  errors: string[];
}

export function BulkImportModal({ open, onOpenChange, onImportComplete }: BulkImportModalProps) {
  const t = useTranslations();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: any[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setFile(null);
        setParsedData([]);
        setHeaders([]);
        setImportResults(null);
      }, 300);
    }
  }, [open]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(selectedFile.type) && !validExtensions.includes(fileExt)) {
      toast.error('Invalid file type. Please upload a CSV or Excel file.');
      return;
    }
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const validateRow = (row: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check for keys with or without the asterisk
    const name_en = row['name_en *'] || row.name_en;
    const selling_price = row['selling_price *'] || row.selling_price;
    const base_unit = row['base_unit *'] || row.base_unit;

    if (!name_en) errors.push('name_en is required');
    if (selling_price === undefined || selling_price === null || selling_price === '') {
      errors.push('selling_price is required');
    } else {
      const price = Number(selling_price);
      if (isNaN(price) || price <= 0) errors.push('selling_price must be a positive number');
    }
    if (!base_unit) errors.push('base_unit is required');
    
    const boolFields = ['is_active', 'requires_prescription'];
    boolFields.forEach(field => {
      if (row[field] !== undefined && row[field] !== '') {
        const val = String(row[field]).toLowerCase().trim();
        if (!['yes', 'no', 'true', 'false', '1', '0'].includes(val)) {
          errors.push(`${field} must be boolean (yes/no/true/false)`);
        }
      }
    });

    return { isValid: errors.length === 0, errors };
  };

  const parseFile = (fileToParse: File) => {
    const fileExt = fileToParse.name.substring(fileToParse.name.lastIndexOf('.')).toLowerCase();
    
    if (fileExt === '.csv') {
      Papa.parse(fileToParse, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows: ParsedRow[] = results.data.map((row: any, index: number) => {
            const validation = validateRow(row);
            return {
              index: index + 1,
              data: row,
              isValid: validation.isValid,
              errors: validation.errors
            };
          });
          setHeaders(results.meta.fields || []);
          setParsedData(rows);
          setStep(2);
        },
        error: () => {
          toast.error('Error parsing CSV file');
          setFile(null);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          
          if (jsonData.length > 0) {
            setHeaders(Object.keys(jsonData[0] as object));
          }
          
          const rows: ParsedRow[] = jsonData.map((row: any, index: number) => {
             const validation = validateRow(row);
             return {
               index: index + 1,
               data: row,
               isValid: validation.isValid,
               errors: validation.errors
             };
          });
          setParsedData(rows);
          setStep(2);
        } catch (error) {
          toast.error('Error parsing Excel file');
          setFile(null);
        }
      };
      reader.readAsBinaryString(fileToParse);
    }
  };

  const handleDownloadTemplate = async (format: 'csv' | 'xlsx') => {
    try {
      await api.downloadImportTemplate(format);
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      const res = await api.bulkImportMedicines(file);
      setImportResults({
        success: res.successful || 0,
        errors: res.errors || []
      });
      setStep(3);
    } catch (error: any) {
      toast.error(error.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleDone = () => {
    onImportComplete();
    handleClose();
  };

  const validCount = parsedData.filter(r => r.isValid).length;
  const errorCount = parsedData.length - validCount;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-6 flex flex-col min-h-[500px] max-h-[90vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-semibold text-slate-100">
              Bulk Import Medicines
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center mb-8">
            <div className={`flex items-center ${step >= 1 ? 'text-blue-500' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 1 ? 'border-blue-500 bg-blue-500/20' : 'border-slate-600'}`}>
                1
              </div>
              <span className="ml-2 font-medium">Upload</span>
            </div>
            <div className={`w-16 h-px mx-4 ${step >= 2 ? 'bg-blue-500' : 'bg-slate-700'}`} />
            <div className={`flex items-center ${step >= 2 ? 'text-blue-500' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 2 ? 'border-blue-500 bg-blue-500/20' : 'border-slate-600'}`}>
                2
              </div>
              <span className="ml-2 font-medium">Preview</span>
            </div>
            <div className={`w-16 h-px mx-4 ${step >= 3 ? 'bg-blue-500' : 'bg-slate-700'}`} />
            <div className={`flex items-center ${step >= 3 ? 'text-blue-500' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 3 ? 'border-blue-500 bg-blue-500/20' : 'border-slate-600'}`}>
                3
              </div>
              <span className="ml-2 font-medium">Results</span>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            {step === 1 && (
              <div className="h-full flex flex-col items-center justify-center space-y-6">
                
                <div className="flex space-x-4 mb-4">
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate('csv')} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                    <FileText className="w-4 h-4 mr-2" /> Download CSV Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate('xlsx')} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Download Excel Template
                  </Button>
                </div>

                <div 
                  className={`w-full max-w-2xl p-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-200 ${isDragging ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-medium text-slate-200 mb-2">Drop your file here</h3>
                  <p className="text-slate-400 mb-6 text-center">Supports CSV and Excel (.xlsx, .xls) files</p>
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                    className="hidden"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  />
                  <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Browse Files
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="h-full flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      <span className="font-medium">{validCount} valid rows</span>
                    </div>
                    {errorCount > 0 && (
                      <div className="flex items-center px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        <span className="font-medium">{errorCount} errors</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" onClick={() => { setStep(1); setFile(null); setParsedData([]); }}>
                      Back
                    </Button>
                    <Button 
                      onClick={handleImport} 
                      disabled={validCount === 0 || isImporting}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isImporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      Import {validCount} Medicines
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto rounded-lg border border-slate-700/50 bg-slate-900 shadow-inner">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 sticky top-0 z-10 backdrop-blur-md">
                      <tr>
                        <th className="px-4 py-3 w-10"></th>
                        {headers.slice(0, 8).map(header => (
                          <th key={header} className="px-4 py-3 font-medium">{header}</th>
                        ))}
                        {headers.length > 8 && <th className="px-4 py-3 font-medium">...</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {parsedData.map((row) => (
                        <tr key={row.index} className={`${row.isValid ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'bg-red-500/5 hover:bg-red-500/10'} transition-colors`}>
                          <td className="px-4 py-3 text-center">
                            {row.isValid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <div className="relative group inline-block cursor-help">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 bg-red-950 text-red-200 text-xs rounded p-2 border border-red-900 shadow-lg z-20">
                                  <ul className="list-disc pl-3">
                                    {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </td>
                          {headers.slice(0, 8).map(header => (
                            <td key={header} className="px-4 py-3 truncate max-w-[150px] text-slate-300">
                              {row.data[header]?.toString() || ''}
                            </td>
                          ))}
                          {headers.length > 8 && <td className="px-4 py-3 text-slate-500">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {step === 3 && importResults && (
              <div className="h-full flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">Import Complete</h2>
                <p className="text-slate-400 mb-8 text-center max-w-md">
                  Successfully imported <span className="font-bold text-emerald-400">{importResults.success}</span> medicines.
                </p>

                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="w-full max-w-2xl bg-red-950/30 border border-red-900/50 rounded-lg p-4 mb-8 max-h-[200px] overflow-auto">
                    <h4 className="text-red-400 font-medium mb-2 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2" /> Failed Rows ({importResults.errors.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-red-300/80">
                      {importResults.errors.map((err, i) => (
                        <li key={i} className="flex">
                          <span className="font-mono text-red-400 mr-2">Row {err.row || '?'}:</span> 
                          <span>{err.error || err.message || 'Unknown error'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button onClick={handleDone} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white min-w-[200px]">
                  Done
                </Button>
              </div>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
