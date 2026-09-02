import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { ResultsTable, ResultsTableHandle } from './components/ResultsTable';
import { PivotTable } from './components/PivotTable';
import { readExcel, exportToExcel, exportPOConfirmation } from './services/excelService'; // Removed fetchExcelFromUrl
import { processPOData, recalculateRow } from './services/businessLogic';
import { ProcessedRow, POInputRow } from './types';

const App: React.FC = () => {
  // Main PO Files (Split by Region)
  const [poFileDE, setPoFileDE] = useState<File | null>(null);
  const [poFileEU, setPoFileEU] = useState<File | null>(null); // ES, FR, IT
  const [poFileUK, setPoFileUK] = useState<File | null>(null);

  const [availFile, setAvailFile] = useState<File | null>(null);

  // System/Config Files (Manual Upload)
  const [tagsFile, setTagsFile] = useState<File | null>(null); // Reverted to File
  const [outerFile, setOuterFile] = useState<File | null>(null); // Reverted to File

  // Data State
  const [processedData, setProcessedData] = useState<ProcessedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // Removed isFetchingConfig state
  const [error, setError] = useState<string | null>(null);

  // Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'pivot'>('details');

  // UI State
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Handle click outside export menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTableFullscreen) {
        setIsTableFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTableFullscreen]);

  // Lock body scroll when in fullscreen
  useEffect(() => {
    if (isTableFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isTableFullscreen]);

  // Ref to access the sorted/filtered data from ResultsTable
  const resultsTableRef = useRef<ResultsTableHandle>(null);

  // Demo Data Generator
  const handleDemoLoad = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const mockData: ProcessedRow[] = [
        {
          'PO Number': 'PO-12345678',
          'Vendor Code': 'AMZ-VENDOR-01',
          'Destination Warehouse': 'MAD4',
          'ASIN': 'B08XYZ1234',
          'EAN Code': '8412345678901',
          'Code Type': 'EAN',
          'Amazon SKU': 'SKU-ABC-100',
          'Product Title': 'Wireless Gaming Mouse RGB - Demo Item',
          'Availability Status': 'Accepted: In stock',
          'Delivery Window Type': 'Weekly',
          'Delivery Window Start Date': new Date(),
          'Delivery Window End Date': new Date(Date.now() + 86400000 * 7),
          'Estimated Delivery Date': new Date(Date.now() + 86400000 * 7),
          'Quantity Requested': 100,
          'Expected Quantity': 100,
          'Unit Cost': 25.50,
          _id: 'demo-1',
          'Brand': 'LogiTech Demo',
          'Line Total': 2550,
          'Total Cancelled': 0,
          'Availability Stock': 500,
          'Units per Outer': 10,
          'Rejection Comments': 'ACCEPTED',
          'Nb of Cartons': 10,
          isRejected: false,
          hasError: false,
          _region: 'EU'
        },
        {
          'PO Number': 'PO-87654321',
          'Vendor Code': 'AMZ-VENDOR-01',
          'Destination Warehouse': 'BCN1',
          'ASIN': 'B09ABC9876',
          'EAN Code': '8498765432109',
          'Code Type': 'EAN',
          'Amazon SKU': 'SKU-XYZ-200',
          'Product Title': 'Mechanical Keyboard - Out of Stock Demo',
          'Availability Status': 'Cancelled: Out of stock',
          'Delivery Window Type': 'Weekly',
          'Delivery Window Start Date': new Date(),
          'Delivery Window End Date': new Date(Date.now() + 86400000 * 7),
          'Estimated Delivery Date': new Date(Date.now() + 86400000 * 7),
          'Quantity Requested': 50,
          'Expected Quantity': 0,
          'Unit Cost': 80.00,
          _id: 'demo-2',
          'Brand': 'Keychron Demo',
          'Line Total': 0,
          'Total Cancelled': 4000,
          'Availability Stock': 0,
          'Units per Outer': 5,
          'Rejection Comments': 'OOS REJECT',
          'Nb of Cartons': 0,
          isRejected: true,
          hasError: true,
          _region: 'EU'
        },
        {
          'PO Number': 'PO-11223344',
          'Vendor Code': 'AMZ-VENDOR-01',
          'Destination Warehouse': 'MAD4',
          'ASIN': 'B07LMN4567',
          'EAN Code': '8456789012345',
          'Code Type': 'EAN',
          'Amazon SKU': 'SKU-DEF-300',
          'Product Title': 'USB-C Cable Pack - Wrong Qty Demo',
          'Availability Status': 'Accepted: In stock',
          'Delivery Window Type': 'Weekly',
          'Delivery Window Start Date': new Date(),
          'Delivery Window End Date': new Date(Date.now() + 86400000 * 7),
          'Estimated Delivery Date': new Date(Date.now() + 86400000 * 7),
          'Quantity Requested': 53, // 53 is not multiple of 10
          'Expected Quantity': 50, // Rule: Rounded to 50
          'Unit Cost': 5.00,
          _id: 'demo-3',
          'Brand': 'CableCo Demo',
          'Line Total': 250,
          'Total Cancelled': 0,
          'Availability Stock': 1000,
          'Units per Outer': 10,
          'Rejection Comments': 'ROUNDED TO OUTER',
          'Nb of Cartons': 5,
          isRejected: false,
          hasError: true,
          _region: 'EU'
        }
      ];
      setProcessedData(mockData);
      setIsProcessing(false);
      setError(null);
    }, 800);
  };

  const handleProcess = async () => {
    setError(null);
    setIsProcessing(true);
    // Removed setIsFetchingConfig(true);

    try {
      // 1. Validation
      if (!poFileDE && !poFileEU && !poFileUK) throw new Error("Please upload at least one PO File (DE, EU, or UK)");
      if (!availFile) throw new Error("Missing Availability File");
      if (!tagsFile) throw new Error("Missing Tags (Config) File"); // Changed to tagsFile
      if (!outerFile) throw new Error("Missing Outer (Config) File"); // Changed to outerFile

      // 2. Read Files Helper
      const readOptional = async (file: File | null) => file ? await readExcel<POInputRow>(file) : [];

      // 3. Read All Files concurrently
      const [poDataDE, poDataEU, poDataUK, availData, tagsData, outerData] = await Promise.all([
        readOptional(poFileDE),
        readOptional(poFileEU),
        readOptional(poFileUK),
        readExcel<any>(availFile),
        readExcel<any>(tagsFile), // Changed to readExcel(tagsFile)
        readExcel<any>(outerFile)  // Changed to readExcel(outerFile)
      ]);
      
      // Removed setIsFetchingConfig(false);

      // 4. Tag Data with Region and Merge
      const taggedDE = poDataDE.map(row => ({ ...row, _region: 'DE' as const }));
      const taggedEU = poDataEU.map(row => ({ ...row, _region: 'EU' as const }));
      const taggedUK = poDataUK.map(row => ({ ...row, _region: 'UK' as const }));

      const combinedPOData = [...taggedDE, ...taggedEU, ...taggedUK];

      if (combinedPOData.length === 0) {
        throw new Error("No PO lines found in the uploaded files.");
      }

      // 5. Process Logic
      const results = processPOData(combinedPOData, tagsData, availData, outerData);
      setProcessedData(results);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unknown error processing files.");
      // Removed setIsFetchingConfig(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRowUpdate = (id: string, updatedRow: ProcessedRow) => {
    const recalculated = recalculateRow(updatedRow);
    setProcessedData(prevData => 
      prevData.map(row => row._id === id ? recalculated : row)
    );
  };

  const handleExportFull = () => {
    if (processedData.length === 0) return;
    
    // Attempt to get the currently sorted/filtered data from the table component
    // If not available (e.g., pivot view), fall back to the raw processedData
    const dataToExport = resultsTableRef.current 
      ? resultsTableRef.current.getDisplayData() 
      : processedData;
      
    exportToExcel(dataToExport, `PO_Processed_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleExportConfirmation = (region: 'DE' | 'EU' | 'UK') => {
    if (processedData.length === 0) return;
    const dateStr = new Date().toISOString().slice(0,10);
    exportPOConfirmation(processedData, region, `PO_Confirmation_${region}_${dateStr}.xlsx`);
    setIsExportMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-20 flex flex-col">
      
      {/* Navbar - Compact */}
      <nav className="bg-amazon-dark text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-0">
            <div className="flex items-center gap-3">
              <img 
                src="https://i.ibb.co/13MkySH/transparent-Photoroom-5.png" 
                alt="The PO Whisperer Logo" 
                onClick={() => setIsLogoModalOpen(true)}
                className="h-32 w-auto rounded shadow-sm border border-gray-600 cursor-pointer hover:opacity-90 transition-opacity"
              />
              <div className="flex flex-col leading-none justify-center">
                <span className="font-bold text-lg text-white">The PO Whisperer</span>
                <span className="text-[10px] text-amazon-orange font-mono">PO Automation v1.1.20</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/amazon-po-automation.zip"
                download="amazon-po-automation.zip"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amazon-orange hover:bg-orange-600 text-white rounded text-xs font-bold shadow-sm transition-all cursor-pointer"
                title="Descargar código completo en archivo .ZIP"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Descargar ZIP</span>
              </a>
              <button
                onClick={handleDemoLoad}
                disabled={isProcessing}
                className="text-xs bg-amazon-light hover:bg-gray-700 text-white px-3 py-1.5 rounded font-medium transition-colors"
                title="Cargar datos de prueba"
              >
                Demo
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Logo Modal */}
      {isLogoModalOpen && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setIsLogoModalOpen(false)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setIsLogoModalOpen(false)}
              className="absolute -top-5 -right-5 bg-white text-gray-800 rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg hover:bg-gray-100 transition-colors z-10 border border-gray-300"
              title="Close"
            >
              ✕
            </button>
            <img 
              src="https://i.ibb.co/13MkySH/transparent-Photoroom-5.png" 
              alt="The PO Whisperer Logo Full Size" 
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 flex-grow">
        
        {/* Error Banner */}
        {error && (
          <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-2 rounded shadow-sm flex justify-between items-center text-sm">
            <div>
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-700 font-bold px-2">×</button>
          </div>
        )}

        {/* Input Section - Ultra Compact & All in One Row (Grid 6) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-amazon-light uppercase tracking-wide flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Input Files
            </h2>
            <div className="flex gap-2">
                 <button
                  onClick={handleDemoLoad}
                  disabled={isProcessing}
                  className="text-[10px] text-gray-400 hover:text-amazon-blue underline decoration-dotted"
                >
                  Load Demo
                </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <FileUpload 
              label="PO Germany" 
              subLabel="Optional"
              selectedFile={poFileDE} 
              onFileSelect={setPoFileDE} 
            />
            <FileUpload 
              label="PO EU (ES/FR/IT)" 
              subLabel="Optional"
              selectedFile={poFileEU} 
              onFileSelect={setPoFileEU} 
            />
             <FileUpload 
              label="PO UK" 
              subLabel="Optional"
              selectedFile={poFileUK} 
              onFileSelect={setPoFileUK} 
            />

            <FileUpload 
              label="1. Availability" 
              subLabel="Required"
              selectedFile={availFile} 
              onFileSelect={setAvailFile} 
              required
            />
            
            {/* Tags FileUpload */}
            <FileUpload 
              label="2. Tags" 
              subLabel="Required"
              selectedFile={tagsFile} 
              onFileSelect={setTagsFile} 
              required
            />

            {/* Outer FileUpload */}
            <FileUpload 
              label="3. OUTER" 
              subLabel="Required"
              selectedFile={outerFile} 
              onFileSelect={setOuterFile} 
              required
            />
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={handleProcess}
              disabled={isProcessing} // Removed isFetchingConfig
              className={`
                px-6 py-1.5 rounded text-sm font-bold text-white shadow-sm transition-all w-full md:w-auto
                ${isProcessing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-amazon-orange hover:bg-orange-500'}
              `}
            >
              {isProcessing ? 'Processing...' : 'Process Orders'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {processedData.length > 0 && (
          <div className={
            isTableFullscreen
              ? "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex flex-col animate-fade-in"
              : "bg-white rounded-lg shadow border border-gray-200 overflow-hidden animate-fade-in-up mb-12"
          }>
            <div className={
              isTableFullscreen 
                ? "bg-white rounded-xl shadow-2xl border border-slate-300 flex flex-col h-full overflow-hidden" 
                : "flex flex-col"
            }>
              {/* Header */}
              <div className="px-4 py-2 border-b border-gray-200 flex flex-wrap justify-between items-center bg-gray-50 gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-amazon-dark">Results</h2>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                    {processedData.length} Lines
                  </span>
                  <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded-full">
                    {processedData.filter(r => r.isRejected).length} Rej
                  </span>
                  {isTableFullscreen && (
                    <span className="text-[11px] font-medium text-slate-500 hidden sm:inline-flex items-center gap-1 bg-slate-200/80 px-2 py-0.5 rounded">
                      <kbd className="font-mono bg-white px-1 rounded shadow-xs text-[10px] border border-slate-300">Esc</kbd> para salir
                    </span>
                  )}
                </div>
                
                {/* Tabs Navigation Compact */}
                <div className="flex bg-white rounded border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`px-4 py-1.5 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer
                      ${activeTab === 'details' 
                        ? 'bg-blue-50 text-amazon-blue' 
                        : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Details
                  </button>
                  <div className="w-px bg-gray-200"></div>
                  <button
                    onClick={() => setActiveTab('pivot')}
                    className={`px-4 py-1.5 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer
                      ${activeTab === 'pivot' 
                        ? 'bg-blue-50 text-amazon-blue' 
                        : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Pivot
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Fullscreen Toggle Button */}
                  <button
                    onClick={() => setIsTableFullscreen(!isTableFullscreen)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all font-medium text-xs shadow-xs cursor-pointer border ${
                      isTableFullscreen 
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 font-semibold' 
                        : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300 hover:text-amazon-blue'
                    }`}
                    title={isTableFullscreen ? "Salir de pantalla completa (Esc)" : "Ver tabla a pantalla completa"}
                  >
                    {isTableFullscreen ? (
                      <>
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Salir Pantalla Completa</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                        <span>Pantalla Completa</span>
                      </>
                    )}
                  </button>

                  {/* PO Export Dropdown */}
                  <div className="relative" ref={exportMenuRef}>
                      <button
                          onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                          className="flex items-center gap-1 px-3 py-1 bg-amazon-light text-white rounded hover:bg-gray-700 transition-colors font-medium text-xs shadow-sm cursor-pointer"
                      >
                          Export PO Confirmation
                          <svg className={`w-3 h-3 ml-1 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {isExportMenuOpen && (
                          <div className="absolute right-0 mt-1 w-40 bg-white rounded-md shadow-xl border border-gray-200 z-50 overflow-hidden animate-fade-in">
                               <div className="py-1">
                                  <button onClick={() => handleExportConfirmation('DE')} className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-amazon-blue cursor-pointer">Germany (DE)</button>
                                  <button onClick={() => handleExportConfirmation('UK')} className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-amazon-blue cursor-pointer">United Kingdom (UK)</button>
                                  <button onClick={() => handleExportConfirmation('EU')} className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-amazon-blue cursor-pointer">EU (ES/IT/FR)</button>
                               </div>
                          </div>
                      )}
                  </div>

                  <button
                      onClick={handleExportFull}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium text-xs shadow-sm cursor-pointer"
                  >
                      Export Full Excel
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className={`p-0 bg-white ${isTableFullscreen ? 'flex-1 overflow-hidden flex flex-col' : ''}`}>
                {activeTab === 'details' ? (
                  <ResultsTable 
                    ref={resultsTableRef}
                    data={processedData} 
                    onRowUpdate={handleRowUpdate} 
                    isFullscreen={isTableFullscreen}
                  />
                ) : (
                  <div className={isTableFullscreen ? "flex-1 overflow-auto p-2" : ""}>
                    <PivotTable data={processedData} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {processedData.length === 0 && !isProcessing && (
          <div className="text-center text-gray-400 mt-12 mb-12">
            <p className="text-sm">Ready to process. Upload at least one PO file.</p>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;