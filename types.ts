export interface POInputRow {
  'PO Number': string;
  'Vendor Code': string;
  'Destination Warehouse': string;
  'ASIN': string;
  'EAN Code': string;
  'Code Type': string;
  'Amazon SKU': string;
  'Product Title': string;
  'Availability Status': string;
  'Delivery Window Type': string;
  'Delivery Window Start Date': string | number | Date;
  'Delivery Window End Date': string | number | Date;
  'Estimated Delivery Date': string | number | Date;
  'Quantity Requested': number;
  'Expected Quantity': number;
  'Unit Cost': number;
  _region?: 'DE' | 'EU' | 'UK'; // Added to track origin
  [key: string]: any;
}

export interface TagRow {
  'ASIN': string;
  'Brand': string;
}

export interface AvailabilityRow {
  'SKU': string;
  'After Assembly Orders GMBH': number;
  'Available': string; // New field for EOL check
}

export interface OuterRow {
  'SKU': string;
  'Units per Outer': number;
}

export interface ProcessedRow extends POInputRow {
  _id: string; // Unique ID for React keys
  // Mapped fields
  'Brand': string;
  
  // Calculated fields
  'Line Total': number;
  'Total Cancelled': number; // New field
  'Availability Stock': number | string; // number or "N/A"
  'Units per Outer': number | string; // number or "N/A"
  'Rejection Comments': string;
  'Nb of Cartons': number;
  
  // UI State
  isRejected: boolean;
  hasError: boolean;
}

export interface AppState {
  poFileDE: File | null;
  poFileEU: File | null;
  poFileUK: File | null;
  availabilityFile: File | null;
  tagsFile: File | null; // Simulating Dropbox
  outerFile: File | null; // Simulating Dropbox
  processedData: ProcessedRow[];
  isProcessing: boolean;
  error: string | null;
}