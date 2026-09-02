import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ProcessedRow } from '../types';

export interface ResultsTableHandle {
  getDisplayData: () => ProcessedRow[];
}

interface ResultsTableProps {
  data: ProcessedRow[];
  onRowUpdate: (id: string, updatedRow: ProcessedRow) => void;
  isFullscreen?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  key: keyof ProcessedRow;
  direction: SortDirection;
}

// Helper to get string representation for filtering/sorting
const getCellValue = (row: ProcessedRow, field: keyof ProcessedRow): string => {
  const val = row[field];
  if (val === null || val === undefined || val === '') return "(Blanks)";
  if (val instanceof Date) return val.toLocaleDateString(); 
  return String(val);
};

// --- NEW COMPONENT: EDITABLE CELL ---
// Handles local state, clear-on-focus, and commit-on-enter
interface EditableCellProps {
  value: any;
  type?: 'text' | 'number' | 'date';
  className?: string;
  onCommit: (newValue: any) => void;
  autoFocus?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = ({ 
  value, 
  type = 'text', 
  className, 
  onCommit,
  autoFocus 
}) => {
  // Local state to hold the value while typing (ignoring validation)
  const [localValue, setLocalValue] = useState<string | number>('');

  // Sync local state when the prop value changes (e.g. from outside or initial load)
  useEffect(() => {
    if (type === 'date' && value) {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          setLocalValue(d.toISOString().split('T')[0]);
          return;
        }
      } catch {}
      setLocalValue('');
    } else {
      setLocalValue(value === null || value === undefined ? '' : value);
    }
  }, [value, type]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text on focus to facilitate copy or overwrite
    e.target.select();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Ensure select all on double click explicitly
    e.currentTarget.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Requirement: Validate/Apply only on Enter
      onCommit(localValue);
      e.currentTarget.blur();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  // We intentionally do NOT commit on Blur to strictly follow "Validation... once Enter is pressed".
  const handleBlur = () => {
      // We re-sync with the prop on blur if user cancels edit by clicking away
      if (type === 'date' && value) {
        try {
            const d = new Date(value);
            if (!isNaN(d.getTime())) setLocalValue(d.toISOString().split('T')[0]);
        } catch {}
      } else {
        setLocalValue(value === null || value === undefined ? '' : value);
      }
  };

  return (
    <input
      type={type}
      className={className}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={value === 'N/A' || value === null ? '' : String(value)}
      autoFocus={autoFocus}
    />
  );
};

// --- FILTER DROPDOWN COMPONENT ---
interface FilterDropdownProps {
  field: keyof ProcessedRow;
  uniqueValues: string[];
  activeFilter: string[] | null;
  onApply: (selected: string[] | null) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ 
  field, uniqueValues, activeFilter, onApply, onClose, position
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(activeFilter || uniqueValues)
  );
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState(position.left);

  const filteredOptions = uniqueValues.filter(v => 
    v.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            setAdjustedLeft(window.innerWidth - rect.width - 20);
        } else {
            setAdjustedLeft(position.left);
        }
    }
  }, [position.left]);

  const toggleValue = (val: string) => {
    const newSet = new Set(selected);
    if (newSet.has(val)) newSet.delete(val);
    else newSet.add(val);
    setSelected(newSet);
  };

  const handleSelectAll = () => {
    const newSet = new Set(selected);
    filteredOptions.forEach(v => newSet.add(v));
    setSelected(newSet);
  };

  const handleClear = () => {
    const newSet = new Set(selected);
    filteredOptions.forEach(v => newSet.delete(v));
    setSelected(newSet);
  };

  const applyFilter = () => {
    if (selected.size === uniqueValues.length && uniqueValues.length > 0) {
      onApply(null); 
    } else if (selected.size === 0) {
       onApply([]);
    } else {
      onApply(Array.from(selected));
    }
    onClose();
  };

  return (
    <div 
      ref={dropdownRef}
      className="fixed bg-white border border-gray-300 shadow-2xl rounded-md z-[9999] flex flex-col text-left font-sans w-64 animate-fade-in"
      style={{ top: position.top, left: adjustedLeft }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-gray-100 bg-gray-50 rounded-t-md">
        <input
          type="text"
          placeholder={`Search ${String(field)}...`}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:border-amazon-blue focus:ring-1 focus:ring-amazon-blue outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setSearchTerm('')} // Requirement: Clear on focus
          autoFocus
        />
      </div>

      <div className="flex justify-between px-3 py-2 bg-white border-b border-gray-100 text-[10px] text-blue-600 font-medium">
        <button onClick={handleSelectAll} className="hover:underline hover:text-blue-800">Select All</button>
        <button onClick={handleClear} className="hover:underline hover:text-blue-800">Clear</button>
      </div>

      <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
        {filteredOptions.length === 0 ? (
          <div className="p-4 text-xs text-gray-400 text-center italic">No matches found</div>
        ) : (
          filteredOptions.map(val => (
            <label key={val} className="flex items-center px-2 py-1.5 hover:bg-blue-50 cursor-pointer rounded text-xs text-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={selected.has(val)}
                onChange={() => toggleValue(val)}
                className="mr-2 rounded border-gray-300 text-amazon-blue focus:ring-amazon-blue h-3.5 w-3.5"
              />
              <span className="truncate select-none">{val}</span>
            </label>
          ))
        )}
      </div>

      <div className="p-2 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-md">
        <button 
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={applyFilter}
          className="px-4 py-1.5 text-xs font-bold text-white bg-amazon-blue hover:bg-blue-800 rounded shadow-sm transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
};


interface ColumnHeaderProps {
  label: string;
  field: keyof ProcessedRow;
  currentSort: SortConfig | null;
  activeFilter: string[] | null;
  uniqueValues: string[];
  onSort: (key: keyof ProcessedRow) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent, field: keyof ProcessedRow) => void;
  className?: string;
  isFilterOpen: boolean;
  onToggleFilter: (field: string, rect: DOMRect) => void;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ 
  label, field, currentSort, activeFilter, uniqueValues,
  onSort, width, onResizeStart, className = "",
  isFilterOpen, onToggleFilter
}) => {
  const isSorted = currentSort?.key === field;
  const isFiltered = activeFilter !== null;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleFilterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (buttonRef.current) {
        onToggleFilter(field as string, buttonRef.current.getBoundingClientRect());
    }
  };

  return (
    <th 
      className={`px-2 py-2 border-r align-top relative group ${className}`}
      style={{ width: width, minWidth: '40px' }}
    >
      <div className="flex items-center justify-between gap-1 overflow-hidden">
        <div 
          onClick={() => onSort(field)}
          className="flex-grow flex items-center cursor-pointer hover:bg-black/5 rounded px-1 -mx-1 py-0.5 select-none truncate"
        >
          <span className="truncate mr-1" title={label}>{label}</span>
          <div className="flex flex-col text-[8px] leading-[8px] text-gray-400 min-w-[8px]">
             <span className={isSorted && currentSort?.direction === 'asc' ? 'text-amazon-blue font-bold' : ''}>▲</span>
             <span className={isSorted && currentSort?.direction === 'desc' ? 'text-amazon-blue font-bold' : ''}>▼</span>
          </div>
        </div>
        
        <button
            ref={buttonRef}
            onClick={handleFilterClick}
            className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${isFiltered || isFilterOpen ? 'text-amazon-blue bg-blue-50 opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
        </button>
      </div>

      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amazon-blue z-10"
        onMouseDown={(e) => onResizeStart(e, field)}
      />
    </th>
  );
};

// --- MODAL COMPONENT ---
interface ReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  currentRow: ProcessedRow | null;
}

const ReasonModal: React.FC<ReasonModalProps> = ({ isOpen, onClose, onConfirm, currentRow }) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCommentText, setCustomCommentText] = useState('');

  // Reset state when modal opens for a new row
  useEffect(() => {
    if (isOpen) {
      setShowCustomInput(false);
      setCustomCommentText(currentRow ? currentRow['Rejection Comments'] : '');
    }
  }, [isOpen, currentRow]);

  if (!isOpen || !currentRow) return null;

  const reasons = [
    { label: 'ACCEPTED (Restore)', value: 'ACCEPTED', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
    { label: 'OOS REJECT (Out of Stock)', value: 'OOS REJECT', color: 'bg-red-100 text-red-800 hover:bg-red-200' },
    { label: 'WRONG QTY REJECT', value: 'WRONG QTY REJECT', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200' },
    { label: 'EOL REJECTED (End of Life)', value: 'EOL REJECTED', color: 'bg-red-100 text-red-800 hover:bg-red-200' },
    { label: 'MANUAL REJECT', value: 'MANUAL REJECT', color: 'bg-gray-100 text-gray-800 hover:bg-gray-200' },
  ];

  const handleCustomCommentConfirm = () => {
    onConfirm(customCommentText);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
        <h3 className="text-lg font-bold text-gray-800 mb-2">Select Status / Rejection Reason</h3>
        <p className="text-sm text-gray-500 mb-4">
          Updating status for PO: <span className="font-mono text-amazon-blue">{currentRow['PO Number']}</span>
        </p>

        {showCustomInput ? (
          <div className="flex flex-col gap-3">
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:border-amazon-blue focus:ring-1 focus:ring-amazon-blue outline-none"
              rows={4}
              placeholder="Enter your custom comment here..."
              value={customCommentText}
              onChange={(e) => setCustomCommentText(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCustomInput(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Back to Options
              </button>
              <button
                onClick={handleCustomCommentConfirm}
                className="px-4 py-2 text-sm font-bold text-white bg-amazon-blue hover:bg-blue-800 rounded-lg shadow-sm transition-colors"
                disabled={!customCommentText.trim()}
              >
                Confirm Custom Comment
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reasons.map((r) => (
              <button
                key={r.value}
                onClick={() => { onConfirm(r.value); onClose(); }}
                className={`px-4 py-3 rounded-lg font-bold text-left transition-colors border border-transparent ${r.color}`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomInput(true)}
              className="mt-2 px-4 py-3 rounded-lg font-bold text-left transition-colors border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              Enter Custom Comment
            </button>
          </div>
        )}
        
        <button 
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const DEFAULT_WIDTHS: Record<string, number> = {
  'PO Number': 100,
  'Vendor Code': 90,
  'Destination Warehouse': 90,
  'ASIN': 100,
  'Brand': 100, // Added Brand here for default width
  'EAN Code': 110,
  'Code Type': 70,
  'Amazon SKU': 120,
  'Product Title': 250,
  'Availability Status': 180,
  'Delivery Window Type': 90,
  'Delivery Window Start Date': 100,
  'Delivery Window End Date': 100,
  'Estimated Delivery Date': 100,
  'Quantity Requested': 80,
  'Expected Quantity': 80,
  'Unit Cost': 80,
  'Line Total': 100,
  'Availability Stock': 80,
  'Units per Outer': 70,
  'Rejection Comments': 200,
  'Nb of Cartons': 80,
  'Total Cancelled': 100
};

export const ResultsTable = forwardRef<ResultsTableHandle, ResultsTableProps>(({ data, onRowUpdate, isFullscreen }, ref) => {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[] | null>>({});
  const [openFilter, setOpenFilter] = useState<{ field: string; top: number; left: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);
  const [modalRow, setModalRow] = useState<ProcessedRow | null>(null);

  const uniqueValuesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (data.length === 0) return map;
    const keys = Object.keys(data[0]) as Array<keyof ProcessedRow>;
    
    keys.forEach(key => {
        const values = new Set<string>();
        data.forEach(row => {
            values.add(getCellValue(row, key));
        });
        map[key as string] = Array.from(values).sort();
    });
    return map;
  }, [data]);

  const handleResizeStart = (e: React.MouseEvent, field: keyof ProcessedRow) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[field as string] || 100;
    resizingRef.current = { field: field as string, startX: e.clientX, startWidth };
    
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { field, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(40, startWidth + diff); 

    setColumnWidths((prev) => ({
      ...prev,
      [field]: newWidth
    }));
  };

  const handleResizeEnd = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  useEffect(() => {
    const handleClickOutside = () => setOpenFilter(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleToggleFilter = (field: string, rect: DOMRect) => {
    if (openFilter && openFilter.field === field) {
        setOpenFilter(null);
    } else {
        setOpenFilter({
            field,
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX
        });
    }
  };

  const handleSort = (key: keyof ProcessedRow) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null; 
    }
    setSortConfig(direction ? { key, direction } : null);
  };

  const handleFilterChange = (key: keyof ProcessedRow, selected: string[] | null) => {
    setActiveFilters(prev => ({
        ...prev,
        [key]: selected
    }));
  };

  // Triggered by EditableCell on COMMIT (Enter)
  const handleEdit = (id: string, field: keyof ProcessedRow, value: any, row: ProcessedRow) => {
    let newValue = value;

    if (field === 'Expected Quantity' || field === 'Unit Cost' || field === 'Quantity Requested' || field === 'Units per Outer') {
      newValue = parseFloat(value);
      if (isNaN(newValue)) newValue = 0;
    }
    
    if (field.toString().includes('Date')) {
        newValue = value ? new Date(value) : null;
    }

    const updatedRow = { ...row, [field]: newValue };
    
    // Check for 0 Quantity Trigger for Modal (if Expected Quantity is manually set to 0)
    if (field === 'Expected Quantity' && newValue === 0 && !updatedRow['Rejection Comments'].toLowerCase().includes('reject')) {
      setModalRow(updatedRow); // Set based on the updated values
    } else {
      onRowUpdate(id, updatedRow);
    }
  };

  const openReasonModal = (row: ProcessedRow) => {
    setModalRow(row);
  };

  const handleReasonConfirm = (reason: string) => {
    if (modalRow) {
      // If the reason is 'ACCEPTED', also try to restore quantity if it was rejected/0.
      let updatedRow = { ...modalRow, 'Rejection Comments': reason };
      if (reason.toLowerCase().includes('accepted') && updatedRow['Expected Quantity'] === 0) {
        updatedRow['Expected Quantity'] = updatedRow['Quantity Requested'];
      } else if (!reason.toLowerCase().includes('accepted') && updatedRow['Expected Quantity'] === updatedRow['Quantity Requested']) {
        // If it's a rejection reason, force quantity to 0 unless it was already partially accepted.
        updatedRow['Expected Quantity'] = 0;
      }
      onRowUpdate(modalRow._id, updatedRow);
      setModalRow(null);
    }
  };

  const processedData = useMemo(() => {
    let result = [...data];

    result = result.filter(row => {
        return Object.keys(activeFilters).every(key => {
            const allowedValues = activeFilters[key];
            if (!allowedValues) return true; 
            const rowVal = getCellValue(row, key as keyof ProcessedRow);
            return allowedValues.includes(rowVal);
        });
    });

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        if (aVal instanceof Date && bVal instanceof Date) {
          return sortConfig.direction === 'asc' 
            ? aVal.getTime() - bVal.getTime() 
            : bVal.getTime() - aVal.getTime();
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, sortConfig, activeFilters]);

  // Expose the processed (sorted/filtered) data to parent via Ref
  useImperativeHandle(ref, () => ({
    getDisplayData: () => processedData
  }), [processedData]);

  const renderHeader = (field: keyof ProcessedRow, label: string, extraClass = "") => (
    <ColumnHeader 
        label={label} 
        field={field} 
        currentSort={sortConfig} 
        activeFilter={activeFilters[field as string] || null}
        uniqueValues={uniqueValuesMap[field as string] || []}
        onSort={handleSort} 
        width={columnWidths[field as string]} 
        onResizeStart={handleResizeStart}
        className={extraClass}
        isFilterOpen={openFilter?.field === field}
        onToggleFilter={handleToggleFilter}
    />
  );

  if (data.length === 0) return null;

  const inputClass = "w-full px-1 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-gray-300 focus:border-amazon-blue rounded focus:ring-1 focus:ring-amazon-blue outline-none transition-colors text-xs truncate";

  return (
    <div className={`overflow-x-auto overflow-y-auto border border-gray-200 bg-white ${
      isFullscreen 
        ? 'flex-1 h-full max-h-none rounded-none' 
        : 'min-h-[400px] max-h-[75vh] pb-32 sm:rounded-lg shadow-md'
    }`}>
      
      <ReasonModal 
        isOpen={!!modalRow} 
        onClose={() => setModalRow(null)} 
        onConfirm={handleReasonConfirm}
        currentRow={modalRow}
      />

      {openFilter && (
        <FilterDropdown 
            field={openFilter.field as keyof ProcessedRow}
            uniqueValues={uniqueValuesMap[openFilter.field] || []}
            activeFilter={activeFilters[openFilter.field]}
            onApply={(selected) => handleFilterChange(openFilter.field as keyof ProcessedRow, selected)}
            onClose={() => setOpenFilter(null)}
            position={{ top: openFilter.top, left: openFilter.left }}
        />
      )}

      <table className="table-fixed w-full text-xs text-left text-gray-700 font-mono whitespace-nowrap">
        <thead className="text-xs text-gray-700 uppercase bg-gray-100 border-b border-gray-300 sticky top-0 z-20 shadow-sm">
          <tr>
            {renderHeader("PO Number", "PO Number")}
            {renderHeader("Vendor Code", "Vendor")}
            {renderHeader("Destination Warehouse", "Dest WH")}
            {renderHeader("ASIN", "ASIN")}
            {renderHeader("Brand", "Brand", "bg-blue-50 border-blue-100 text-blue-900")}
            {renderHeader("EAN Code", "EAN")}
            {renderHeader("Code Type", "Type")}
            {renderHeader("Amazon SKU", "SKU")}
            {renderHeader("Product Title", "Title")}
            {renderHeader("Availability Status", "Avail Status")}
            {renderHeader("Delivery Window Type", "Win Type")}
            {renderHeader("Delivery Window Start Date", "Win Start")}
            {renderHeader("Delivery Window End Date", "Win End")}
            {renderHeader("Estimated Delivery Date", "Est Date")}
            {renderHeader("Quantity Requested", "Qty Req (N)", "bg-gray-50")}
            {renderHeader("Expected Quantity", "Exp Qty (O)", "bg-yellow-50 border-yellow-100")}
            {renderHeader("Unit Cost", "Unit Cost (P)", "bg-yellow-50 border-yellow-100")}
            {renderHeader("Line Total", "Total", "bg-green-50 text-green-800 border-green-100")}
            {renderHeader("Availability Stock", "Avail", "bg-purple-50 text-purple-800 border-purple-100")}
            {renderHeader("Units per Outer", "Outer", "bg-purple-50 text-purple-800 border-purple-100")}
            {renderHeader("Rejection Comments", "Comments (Click to Change)", "bg-gray-50 border-gray-100")}
            {renderHeader("Nb of Cartons", "Cartons", "bg-green-50 text-green-800 border-green-100")}
            {renderHeader("Total Cancelled", "Total Cancelled", "bg-red-100 text-red-800 border-red-200")}
          </tr>
        </thead>
        <tbody>
          {processedData.map((row) => {
            const isPartial = !row.isRejected && row['Expected Quantity'] > 0 && row['Expected Quantity'] < row['Quantity Requested'];
            const isAllocatedRejected = row['Rejection Comments'].includes("ALLOCATED TO PREVIOUS");
            
            let rowClass = "border-b hover:bg-gray-50 transition-colors ";
            
            if (isAllocatedRejected) {
                rowClass += "bg-slate-200"; 
            } else if (row.isRejected) {
                rowClass += "bg-red-50";
            } else if (isPartial) {
                rowClass += "bg-yellow-100";
            } else if (row['Rejection Comments'].toLowerCase().includes('accepted') && row['Expected Quantity'] === row['Quantity Requested']) {
                rowClass += "bg-green-50/50";
            } else if (row.hasError) {
                rowClass += "bg-orange-50";
            }

            return (
            <tr key={row._id} className={rowClass}>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['PO Number']} onCommit={(val) => handleEdit(row._id, 'PO Number', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['Vendor Code']} onCommit={(val) => handleEdit(row._id, 'Vendor Code', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['Destination Warehouse']} onCommit={(val) => handleEdit(row._id, 'Destination Warehouse', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={`${inputClass} font-bold`} value={row['ASIN']} onCommit={(val) => handleEdit(row._id, 'ASIN', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={`${inputClass} font-semibold text-blue-700`} value={row['Brand']} onCommit={(val) => handleEdit(row._id, 'Brand', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['EAN Code']} onCommit={(val) => handleEdit(row._id, 'EAN Code', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['Code Type']} onCommit={(val) => handleEdit(row._id, 'Code Type', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={`${inputClass} font-bold`} value={row['Amazon SKU']} onCommit={(val) => handleEdit(row._id, 'Amazon SKU', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['Product Title']} onCommit={(val) => handleEdit(row._id, 'Product Title', val, row)} />
              </td>

              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['Availability Status']} onCommit={(val) => handleEdit(row._id, 'Availability Status', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell className={inputClass} value={row['Delivery Window Type']} onCommit={(val) => handleEdit(row._id, 'Delivery Window Type', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell type="date" className={inputClass} value={row['Delivery Window Start Date']} onCommit={(val) => handleEdit(row._id, 'Delivery Window Start Date', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell type="date" className={inputClass} value={row['Delivery Window End Date']} onCommit={(val) => handleEdit(row._id, 'Delivery Window End Date', val, row)} />
              </td>
              <td className="px-1 py-1 border-r truncate">
                <EditableCell type="date" className={inputClass} value={row['Estimated Delivery Date']} onCommit={(val) => handleEdit(row._id, 'Estimated Delivery Date', val, row)} />
              </td>

              <td className="px-1 py-1 border-r truncate">
                <EditableCell type="number" className={`${inputClass} font-bold`} value={row['Quantity Requested']} onCommit={(val) => handleEdit(row._id, 'Quantity Requested', val, row)} />
              </td>
              
              <td className="px-1 py-1 border-r truncate">
                <EditableCell 
                    type="number" 
                    className={`${inputClass} font-bold text-center bg-yellow-50 focus:bg-white`} 
                    value={row['Expected Quantity']} 
                    onCommit={(val) => handleEdit(row._id, 'Expected Quantity', val, row)} 
                />
              </td>
              
              <td className="px-1 py-1 border-r truncate">
                <EditableCell type="number" className={inputClass} value={row['Unit Cost']} onCommit={(val) => handleEdit(row._id, 'Unit Cost', val, row)} />
              </td>

              <td className="px-1 py-1 border-r truncate text-right font-mono font-medium text-green-700">{row['Line Total']?.toFixed(2)}</td>
              <td className="px-1 py-1 border-r truncate text-center font-bold text-sm">{row['Availability Stock']}</td>
              
              {/* EDITABLE OUTER CELL */}
              <td className="px-1 py-1 border-r truncate">
                  <EditableCell 
                    type="number" 
                    className={`${inputClass} font-bold text-center text-purple-800`} 
                    value={row['Units per Outer'] === 'N/A' ? '' : row['Units per Outer']} 
                    onCommit={(val) => handleEdit(row._id, 'Units per Outer', val, row)} 
                  />
              </td>
              
              {/* REJECTION COMMENTS - Now editable via modal, and affects status */}
              <td 
                className={`px-1 py-1 border-r truncate cursor-pointer hover:underline font-semibold ${
                    row['Rejection Comments'].toLowerCase().includes('accepted') && row['Expected Quantity'] === row['Quantity Requested'] ? 'text-green-600' : 
                    isAllocatedRejected ? 'text-slate-700' :
                    row['Rejection Comments'].toLowerCase().includes('reject') ? 'text-red-600' : 'text-orange-500'
                }`}
                onClick={() => openReasonModal(row)}
                title={row['Rejection Comments']}
              >
                {row['Rejection Comments']}
              </td>

              <td className="px-1 py-1 border-r truncate text-center">{typeof row['Nb of Cartons'] === 'number' ? row['Nb of Cartons'].toFixed(1) : row['Nb of Cartons']}</td>
              <td className="px-1 py-1 border-r truncate text-right font-mono font-medium text-red-600">{row['Total Cancelled']?.toFixed(2)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

ResultsTable.displayName = 'ResultsTable';