import * as XLSX_LIB from 'xlsx-js-style';
import { ProcessedRow } from '../types';

// Safely handle default vs named namespace exports
// @ts-ignore
const XLSX: any = (XLSX_LIB as any)?.read ? XLSX_LIB : ((XLSX_LIB as any)?.default || XLSX_LIB);

// Translation Map: File Header -> App Internal Name
const COLUMN_MAPPING: { [key: string]: string } = {
  // A: PO Number
  'PO': 'PO Number',
  'PO Number': 'PO Number',
  
  // B: Vendor Code
  'Vendor': 'Vendor Code',
  'Vendor Code': 'Vendor Code',
  
  // C: Destination Warehouse
  'Warehouse': 'Destination Warehouse',
  'Destination Warehouse': 'Destination Warehouse',
  
  // D: ASIN
  'ASIN': 'ASIN',
  
  // E: EAN Code (In your file 'External ID')
  'External ID': 'EAN Code',
  'EAN': 'EAN Code',
  'EAN Code': 'EAN Code',
  
  // F: Code Type (In your file 'External Id Type')
  'External Id Type': 'Code Type',
  'Code Type': 'Code Type',
  
  // G: Amazon SKU (In your file 'Model Number')
  'Model Number': 'Amazon SKU',
  'Amazon SKU': 'Amazon SKU',
  'SKU': 'Amazon SKU', // Generic
  
  // H: Product Title (In your file 'Title')
  'Title': 'Product Title',
  'Product Title': 'Product Title',
  
  // I: Availability Status (In your file 'Availability')
  'Availability': 'Availability Status',
  'Availability Status': 'Availability Status',
  
  // J: Delivery Window Type (In your file 'Window Type')
  'Window Type': 'Delivery Window Type',
  'Delivery Window Type': 'Delivery Window Type',
  
  // K: Delivery Window Start Date (In your file 'Window start')
  'Window start': 'Delivery Window Start Date',
  'Delivery Window Start Date': 'Delivery Window Start Date',
  
  // L: Delivery Window End Date (In your file 'Window end')
  'Window end': 'Delivery Window End Date',
  'Delivery Window End Date': 'Delivery Window End Date',
  
  // M: Estimated Delivery Date (In your file 'Expected date')
  'Expected date': 'Estimated Delivery Date',
  'Estimated Delivery Date': 'Estimated Delivery Date',
  
  // N: Quantity Requested
  'Quantity Requested': 'Quantity Requested',
  
  // O: Expected Quantity
  'Expected Quantity': 'Expected Quantity',
  
  // P: Unit Cost
  'Unit Cost': 'Unit Cost',

  // --- Mappings for OUTER file ---
  'Article No.': 'SKU',
  'Article No': 'SKU',
  'Units Outer': 'Units per Outer',
  'Units CDU/Inner': 'Units per Inner',

  // --- Mappings for Availability file ---
  'Item No.': 'SKU',
  'Item No': 'SKU',
  'After Assembly Orders': 'After Assembly Orders GMBH', // Variation match
  'After Assembly Orders GMBH': 'After Assembly Orders GMBH',
  'Available': 'Available'
};

// Helper to parse European numbers (1.000,00 -> 1000.00)
const parseEuropeanNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  if (typeof val === 'string') {
    // 1. Remove thousands separator (dots)
    // 2. Replace decimal comma with dot
    const clean = val.replace(/\./g, '').replace(',', '.').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

// Helper to parse various date formats (Excel date object, serial number, string DD.MM.YYYY, string DD/MM/YYYY)
const parseExcelDate = (val: any): Date | null => {
  if (!val) return null;
  
  // 1. If it's already a JS Date
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // 2. If it's a number (Excel Serial Date)
  // We disabled cellDates in readExcel, so raw Excel dates come here as numbers.
  if (typeof val === 'number') {
    // Excel base date is Dec 30 1899 usually. 
    // val - 25569 = Days since 1970-01-01.
    // CRITICAL FIX v1.1.11: Use Math.floor to strictly ignore time components (e.g., .99)
    // Add 12 hours (Noon) to force the date to the middle of the day in UTC.
    // This prevents timezone shifts when converting to strings later.
    return new Date((Math.floor(val - 25569) * 864e5) + (12 * 3600 * 1000)); 
  }

  // 3. If it's a string
  if (typeof val === 'string') {
    const cleanVal = val.trim();
    let year: number | undefined, month: number | undefined, day: number | undefined;

    // Try parsing DD.MM.YYYY
    let parts = cleanVal.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (parts) {
      day = parseInt(parts[1], 10);
      month = parseInt(parts[2], 10) - 1; // Month is 0-indexed
      year = parseInt(parts[3], 10);
    } else {
      // Try parsing DD/MM/YYYY
      parts = cleanVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (parts) {
        day = parseInt(parts[1], 10);
        month = parseInt(parts[2], 10) - 1;
        year = parseInt(parts[3], 10);
      } else {
        // Try parsing YYYY-MM-DD
        parts = cleanVal.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (parts) {
          year = parseInt(parts[1], 10);
          month = parseInt(parts[2], 10) - 1;
          day = parseInt(parts[3], 10);
        }
      }
    }

    if (year !== undefined && month !== undefined && day !== undefined) {
      // Create date in UTC at noon to avoid timezone shifts.
      // This makes string parsing consistent with number (Excel serial) parsing.
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    }

    // Fallback for other string formats that new Date() can handle (e.g. from manual edits)
    const d = new Date(cleanVal);
    if (!isNaN(d.getTime())) {
       // Reconstruct as UTC at noon from local parts to avoid timezone shift on format
       return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
    }
    
    return null; // Could not parse
  }

  return null;
};

// Helper to format Date to YYYY-MM-DD
// CRITICAL FIX v1.1.11: Use UTC methods to match the Noon-UTC normalization
const formatDateToYYYYMMDD = (dateVal: any): string => {
  if (!dateVal) return "";
  let d = dateVal;
  if (!(d instanceof Date)) {
    d = parseExcelDate(dateVal);
  }
  if (!d || isNaN(d.getTime())) return "";
  
  // Use UTC methods because our parser sets the date to Noon UTC.
  // This ignores the browser's local timezone offset.
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Modified: readExcel now only accepts a File object.
export const readExcel = async <T>(file: File): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // CRITICAL FIX v1.1.11: Set cellDates: false to get raw numbers for dates.
        // This allows our custom parseExcelDate to handle rounding (Math.floor) strictly.
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Get raw JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        // DATA NORMALIZATION
        const normalizedData = rawData.map((row: any) => {
          const newRow: any = {};
          
          Object.keys(row).forEach(rawKey => {
            const cleanKey = rawKey.trim();
            // Check mapping
            const mappedKey = COLUMN_MAPPING[cleanKey] || cleanKey;
            
            let value = row[rawKey];

            // Special treatment for numeric fields
            if (['Unit Cost', 'Quantity Requested', 'Expected Quantity', 'Units per Outer', 'After Assembly Orders GMBH'].includes(mappedKey)) {
               value = parseEuropeanNumber(value);
            }

            // Special treatment for Date fields
            if (['Delivery Window Start Date', 'Delivery Window End Date', 'Estimated Delivery Date'].includes(mappedKey)) {
              value = parseExcelDate(value);
            }

            newRow[mappedKey] = value;
          });
          
          return newRow;
        });

        resolve(normalizedData as T[]);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

// Removed fetchExcelFromUrl function as it is no longer used.

export const exportToExcel = (data: ProcessedRow[], fileName: string) => {
  // 1. Prepare Data
  const exportData = data.map(row => {
      const safeVal = (val: any) => val === undefined || val === null ? "" : val;
      
      return {
        // Strict Mapping A-P
        'PO Number': safeVal(row['PO Number']),                
        'Vendor Code': safeVal(row['Vendor Code']),            
        'Destination Warehouse': safeVal(row['Destination Warehouse']), 
        'ASIN': safeVal(row['ASIN']),                          
        'Brand': safeVal(row['Brand']), // NEW: Brand column next to ASIN
        'EAN Code': safeVal(row['EAN Code']),                  
        'Code Type': safeVal(row['Code Type']),                
        'Amazon SKU': safeVal(row['Amazon SKU']),
        'Product Title': safeVal(row['Product Title']),        
        'Availability Status': safeVal(row['Availability Status']),
        'Delivery Window Type': safeVal(row['Delivery Window Type']),
        
        // Format dates strictly YYYY-MM-DD
        'Delivery Window Start Date': formatDateToYYYYMMDD(row['Delivery Window Start Date']),
        'Delivery Window End Date': formatDateToYYYYMMDD(row['Delivery Window End Date']),
        'Estimated Delivery Date': formatDateToYYYYMMDD(row['Estimated Delivery Date']),
        
        'Quantity Requested': safeVal(row['Quantity Requested']),
        'Expected Quantity': safeVal(row['Expected Quantity']),
        'Unit Cost': safeVal(row['Unit Cost']),
        'Line Total': safeVal(row['Line Total']),
        'Total Cancelled': safeVal(row['Total Cancelled']),
        'Availability Stock': safeVal(row['Availability Stock']),
        'Units per Outer': safeVal(row['Units per Outer']),
        'Rejection Comments': safeVal(row['Rejection Comments']),
        'Nb of Cartons': safeVal(row['Nb of Cartons'])
      };
  });

  // 2. Create Sheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // 3. Apply Styles based on original data (row index matches)
  // Header is row 0. Data starts at row 1.
  // We iterate through the original 'data' array to check conditions.
  const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:A1");
  
  for (let i = 0; i < data.length; i++) {
    const rowData = data[i];
    const rowIndex = i + 1; // 1-based index (0 is header)

    let fillColor = null;
    
    // Style Rules
    const isPartial = !rowData.isRejected && rowData['Expected Quantity'] > 0 && rowData['Expected Quantity'] < rowData['Quantity Requested'];
    
    if (rowData.isRejected) {
        fillColor = { rgb: "FF9999" }; // Light Red for Rejected
    } else if (isPartial) {
        fillColor = { rgb: "FFFF99" }; // Light Yellow for Partial
    }

    if (fillColor) {
        // Apply to all columns in this row
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: C });
            if (!worksheet[cellRef]) continue;
            
            worksheet[cellRef].s = {
                fill: { fgColor: fillColor }
            };
        }
    }
  }

  // 4. Auto-width columns (Simple heuristic)
  const colWidths = Object.keys(exportData[0] || {}).map(key => ({ wch: key.length + 5 }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Processed POs");
  XLSX.writeFile(workbook, fileName);
};

export const exportPOConfirmation = (data: ProcessedRow[], region: 'DE' | 'EU' | 'UK', fileName: string) => {
    // Filter by region
    const filtered = data.filter(r => r._region === region);
    
    // Map to required 5 columns
    const exportData = filtered.map(row => ({
        'PO Number': row['PO Number'],
        'ASIN': row['ASIN'],
        'Availability': row['Availability Status'],
        'Accepted quantity': row['Expected Quantity'],
        // Requirement v1.1.7: Expected date must be EST DATE (which is in `Estimated Delivery Date`) in YYYY-MM-DD
        'Expected date (yyyy-MM-dd)': formatDateToYYYYMMDD(row['Estimated Delivery Date'])
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PO Confirmation");
    XLSX.writeFile(workbook, fileName);
};