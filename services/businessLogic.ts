import { POInputRow, TagRow, AvailabilityRow, OuterRow, ProcessedRow } from '../types';

// Helper to normalize keys (trim spaces, handle slight variations)
const normalize = (str: string | number | undefined) => str ? String(str).trim() : '';

export const processPOData = (
  poData: POInputRow[],
  tagsData: TagRow[],
  availData: AvailabilityRow[],
  outerData: OuterRow[]
): ProcessedRow[] => {
  
  // 1. Build Lookup Maps for Performance
  const tagsMap = new Map<string, string>();
  tagsData.forEach(row => {
    if (row.ASIN) tagsMap.set(normalize(row.ASIN), row.Brand);
  });

  // Store Quantity AND Status in map (STATIC MAP - Original State)
  const availMap = new Map<string, { qty: number, status: string }>();
  availData.forEach(row => {
    if (row.SKU) {
        availMap.set(normalize(row.SKU), {
            qty: Number(row['After Assembly Orders GMBH'] || 0),
            status: row['Available'] ? String(row['Available']).toUpperCase() : ''
        });
    }
  });

  // RUNNING MAP - Track consumption sequentially
  // We clone the values so we can deduct without affecting the reference map immediately if we needed to restart, 
  // but here we just process once.
  const runningStockMap = new Map<string, { qty: number, status: string }>();
  availMap.forEach((val, key) => {
    runningStockMap.set(key, { ...val });
  });

  const outerMap = new Map<string, number>();
  outerData.forEach(row => {
    if (row.SKU) outerMap.set(normalize(row.SKU), Number(row['Units per Outer'] || 1));
  });

  return poData.map((row, index) => {
    const asin = normalize(row.ASIN);
    let originalSku = normalize(row['Amazon SKU']); // This is the SKU from the PO
    const baseSkuFromPO = originalSku; // Store original PO SKU for outer lookup
    
    const region = row._region || 'EU'; // Default to EU if undefined
    
    // Ensure numeric values are read correctly
    const requestedQty = Number(row['Quantity Requested'] || 0);
    const unitCost = Number(row['Unit Cost'] || 0);

    // --- Mappings ---
    const brand = tagsMap.get(asin) || '';
    
    // --- SKU SELECTION & RUNNING STOCK LOOKUP (for Availability) ---
    // New logic: Prioritize SKU variant based on PO region.
    let prioritizedSkuList: string[];
    
    if (region === 'DE') {
        // For DE, prioritize local SKU, then base, then EN.
        prioritizedSkuList = [originalSku + 'DE', originalSku, originalSku + 'EN'];
    } else { // EU or UK
        // For non-DE, EN SKU has absolute priority.
        prioritizedSkuList = [originalSku + 'EN', originalSku, originalSku + 'DE'];
    }

    let foundSku: string | null = null;
    for (const sku of prioritizedSkuList) {
        if (runningStockMap.has(sku)) {
            foundSku = sku;
            break; // Found the highest priority SKU that exists, stop searching.
        }
    }

    // Use the found SKU, or default back to the original from the PO file if no variants were found at all.
    // This allows the downstream logic to correctly report "OOS REJECT" for a SKU not in the availability file.
    const matchedSku = foundSku || originalSku;
    
    // Now get the availability info for the matched SKU. If not found in map, it will be qty: -1.
    const availEntry = runningStockMap.get(matchedSku) || { qty: -1, status: '' };
    const initialAvailEntry = availMap.get(matchedSku) || { qty: -1, status: '' };
    
    // Current available quantity in the sequence
    const currentAvailableQty = availEntry.qty;
    const availStatusInfo = availEntry.status;


    // --- OUTER LOOKUP (Independent Logic based on base SKU from PO) ---
    let unitsPerOuter = -1; // Default to not found

    // 1. Try exact match from PO's base SKU
    if (outerMap.has(baseSkuFromPO)) {
        unitsPerOuter = outerMap.get(baseSkuFromPO)!;
    } 
    // 2. If not found, try region-specific variants from PO's base SKU
    //    Prioritize based on PO row's region
    else {
        if (region === 'DE') {
            if (outerMap.has(baseSkuFromPO + 'DE')) {
                unitsPerOuter = outerMap.get(baseSkuFromPO + 'DE')!;
            } else if (outerMap.has(baseSkuFromPO + 'EN')) {
                unitsPerOuter = outerMap.get(baseSkuFromPO + 'EN')!;
            }
        } else { // EU or UK
            if (outerMap.has(baseSkuFromPO + 'EN')) {
                unitsPerOuter = outerMap.get(baseSkuFromPO + 'EN')!;
            } else if (outerMap.has(baseSkuFromPO + 'DE')) {
                unitsPerOuter = outerMap.get(baseSkuFromPO + 'DE')!;
            }
        }
    }
    
    // --- EST DATE LOGIC ---
    // Requirement v1.1.7: EST DATE must be equal to Window End Date.
    const finalEstDate = row['Delivery Window End Date'];

    // --- Validation Logic ---
    let comments: string[] = [];
    
    if (!brand) comments.push("ASIN NOT FOUND IN TAGS");

    let expectedQty = requestedQty; // Default to requested
    let proceedToStockCheck = true;

    // 1. Check Outer existence first (Blocking)
    if (unitsPerOuter === -1) {
      expectedQty = 0;
      comments.push("SKU NOT FOUND IN OUTER");
      proceedToStockCheck = false;
    }
    // 2. Check Wrong Quantity (Logic Updated: Round Down instead of Reject)
    else if (unitsPerOuter > 0 && (requestedQty % unitsPerOuter !== 0)) {
       const fullOuters = Math.floor(requestedQty / unitsPerOuter);
       
       if (fullOuters >= 1) {
           // Round down to nearest outer
           expectedQty = fullOuters * unitsPerOuter;
           comments.push("ROUNDED TO OUTER");
           // Proceed to stock check with new quantity
       } else {
           // Not even 1 outer requested
           expectedQty = 0;
           comments.push("WRONG QTY REJECT");
           proceedToStockCheck = false;
       }
    }
    
    // 3. Check Stock / Availability (Sequential Logic)
    if (proceedToStockCheck) {
      // Case A: Missing from availability file entirely
      if (currentAvailableQty === -1) {
        expectedQty = 0;
        comments.push("OOS REJECT");
      } 
      // Case B: Stock check
      else {
        // If we have less than needed
        if (currentAvailableQty < expectedQty) {
          
          const fullOutersPossible = Math.floor(currentAvailableQty / unitsPerOuter);
          
          if (fullOutersPossible >= 1) {
            // Partial Allocation
            expectedQty = fullOutersPossible * unitsPerOuter;
            comments.push("INSUFFICIENT STOCK - PARTIAL");
          } else {
            // Zero Allocation
            expectedQty = 0;
            
            // CHECK: Was it EOL?
            if (availStatusInfo === 'OUT OF CATALOGUE') {
                comments.push("EOL REJECTED");
            } 
            // CHECK: Was it populated initially? 
            // If Initial Stock > 0 BUT Current Stock is 0 (or < outer), 
            // it means previous lines consumed it.
            else if (initialAvailEntry.qty > 0 && initialAvailEntry.qty >= unitsPerOuter) {
                comments.push("STOCK ALLOCATED TO PREVIOUS PO");
            } else {
                // It was OOS from the start
                comments.push("OOS REJECT");
            }
          }
        }
      }
    }

    // --- CONSUME STOCK ---
    // If we assigned stock, deduct it from the running map for future rows
    if (expectedQty > 0 && matchedSku && runningStockMap.has(matchedSku)) {
        const entry = runningStockMap.get(matchedSku)!;
        entry.qty = Math.max(0, entry.qty - expectedQty);
        runningStockMap.set(matchedSku, entry);
    }

    // Determine rejection based on key comments
    const isRejected = comments.some(c => c.includes("REJECT") || c.includes("NOT FOUND") || c.includes("ALLOCATED TO PREVIOUS"));

    // If no negative comments, add ACCEPTED
    if (comments.length === 0) {
      comments.push("ACCEPTED");
    }

    // Error flag only if there are comments that are NOT "ACCEPTED"
    const hasError = comments.some(c => c !== "ACCEPTED");

    // --- Specific Text Updates for Availability Status ---
    let finalAvailStatus = row['Availability Status'];
    
    // Priority logic for Status text
    if (comments.includes("ROUNDED TO OUTER") && !comments.includes("INSUFFICIENT STOCK - PARTIAL")) {
        finalAvailStatus = "Accepted: In stock";
    } else if (expectedQty > 0 && expectedQty < requestedQty) {
        finalAvailStatus = "Accepted: Partial Quantity";
    } else if (comments.includes("ACCEPTED")) {
      finalAvailStatus = "Accepted: In stock";
    } else if (comments.includes("WRONG QTY REJECT")) {
      finalAvailStatus = "Cancelled: Does not meet minimum";
    } else if (comments.includes("EOL REJECTED")) {
      finalAvailStatus = "Cancelled: Discontinued";
    } else if (comments.includes("STOCK ALLOCATED TO PREVIOUS PO")) {
      finalAvailStatus = "Cancelled: Out of stock";
    } else if (comments.includes("OOS REJECT")) {
      finalAvailStatus = "Cancelled: Out of stock";
    } else if (comments.includes("MANUAL REJECT")) {
      finalAvailStatus = "Cancelled: Manual Rejection";
    }

    // --- Final Calculations ---
    const totalLine = expectedQty * unitCost;
    const totalCancelled = isRejected ? (requestedQty * unitCost) : 0;
    const nbCartons = (unitsPerOuter > 0 && unitsPerOuter !== -1) ? expectedQty / unitsPerOuter : 0;

    return {
      ...row,
      _id: `row-${index}-${Date.now()}`,
      'Amazon SKU': matchedSku, // Keep this as the matchedSku from availability
      'Estimated Delivery Date': finalEstDate,
      'Brand': brand,
      'Availability Status': finalAvailStatus,
      'Availability Stock': currentAvailableQty === -1 ? "N/A" : currentAvailableQty, // Show REMAINING stock at this point
      'Units per Outer': unitsPerOuter === -1 ? "N/A" : unitsPerOuter,
      'Expected Quantity': expectedQty,
      'Line Total': totalLine,
      'Total Cancelled': totalCancelled,
      'Nb of Cartons': nbCartons,
      'Rejection Comments': comments.join(' | '),
      isRejected: isRejected,
      hasError: hasError,
      _region: region
    };
  });
};

export const recalculateRow = (row: ProcessedRow): ProcessedRow => {
  // 1. Parse numeric fields
  let expectedQty = Number(row['Expected Quantity'] || 0);
  const requestedQty = Number(row['Quantity Requested'] || 0);
  const unitCost = Number(row['Unit Cost'] || 0);
  let unitsPerOuter = Number(row['Units per Outer']) || 0;

  // 2. EST DATE Logic: Preserve what is in the row (allows manual edits to stick)
  // Previously we forced it to row['Delivery Window End Date'], but now we trust the row.
  const finalEstDate = row['Estimated Delivery Date'];

  // 3. Logic: Status Updates
  let commentsStr = row['Rejection Comments'];
  let commentsArr = commentsStr.split(' | ').filter(c => c); // Keep all comments for initial parsing

  // --- MANUAL OUTER CORRECTION ---
  // If user entered a valid outer, remove the specific error
  if (unitsPerOuter > 0) {
      commentsArr = commentsArr.filter(c => c !== "SKU NOT FOUND IN OUTER");
      
      // Re-validate WRONG QTY based on new Outer
      const isWrongQty = requestedQty % unitsPerOuter !== 0;
      
      // Remove old wrong qty error first
      commentsArr = commentsArr.filter(c => c !== "WRONG QTY REJECT");
      commentsArr = commentsArr.filter(c => c !== "ROUNDED TO OUTER");
      
      if (isWrongQty) {
          const fullOuters = Math.floor(requestedQty / unitsPerOuter);
          if (fullOuters >= 1) {
              commentsArr.push("ROUNDED TO OUTER");
              expectedQty = fullOuters * unitsPerOuter;
          } else {
              commentsArr.push("WRONG QTY REJECT");
              expectedQty = 0; // Force fail
          }
      } else {
          // Exact multiple. 
          // If there are no other blocking errors, restore full qty
           const blockingErrors = commentsArr.filter(c => c.includes("REJECT") || c.includes("NOT FOUND") || c.includes("ALLOCATED"));
           if (blockingErrors.length === 0) {
               expectedQty = requestedQty;
           }
      }
  }
  
  // --- Determine isRejected and hasError flags based on ALL comments ---
  let isRejected = commentsArr.some(c => 
    c.toLowerCase().includes("reject") || 
    c.toLowerCase().includes("not found") || 
    c.toLowerCase().includes("allocated to previous") ||
    (c.toLowerCase().includes("oos") && !c.toLowerCase().includes("partial")) // Explicit OOS without partial means full rejection
  );

  let hasError = commentsArr.some(c => 
    !c.toLowerCase().includes("accepted") || // Any comment not explicitly "ACCEPTED"
    (c.toLowerCase().includes("partial") && expectedQty < requestedQty) // Partial is an error/warning
  );

  // Override flags if "ACCEPTED" is explicitly in comments AND quantity is full
  if (commentsStr.toLowerCase().includes("accepted") && expectedQty === requestedQty && requestedQty > 0) {
    isRejected = false;
    hasError = false;
  } else if (commentsStr.toLowerCase().includes("accepted") && expectedQty < requestedQty && expectedQty > 0) {
    // If accepted but partial, not rejected but has error/warning
    isRejected = false;
    hasError = true;
  }
  // If expectedQty is 0 and it's not explicitly accepted, it's rejected
  else if (expectedQty === 0 && requestedQty > 0 && !commentsStr.toLowerCase().includes('accepted')) {
    isRejected = true;
    hasError = true;
    if (!commentsArr.some(c => c.toLowerCase().includes("reject") || c.toLowerCase().includes("oos") || c.toLowerCase().includes("not found"))) {
      commentsArr.push("MANUAL REJECT (Quantity set to 0)"); // Add a default comment if none found
    }
  }


  // --- Specific Text Updates for Availability Status (Recalculation) ---
  let finalAvailStatus = row['Availability Status'];
  
  // Rule: If comment includes ACCEPTED, set Availability Status to "Accepted: In stock"
  if (commentsStr.toLowerCase().includes("accepted")) {
    finalAvailStatus = "Accepted: In stock";
  } else if (commentsStr.includes("ROUNDED TO OUTER") && expectedQty > 0 && expectedQty < requestedQty) {
    finalAvailStatus = "Accepted: Partial Quantity"; // If rounded to outer and partial
  } else if (expectedQty > 0 && expectedQty < requestedQty) {
      finalAvailStatus = "Accepted: Partial Quantity";
  } else if (commentsStr.includes("WRONG QTY REJECT")) {
      finalAvailStatus = "Cancelled: Does not meet minimum";
  } else if (commentsStr.includes("EOL REJECTED")) {
    finalAvailStatus = "Cancelled: Discontinued";
  } else if (commentsStr.includes("STOCK ALLOCATED TO PREVIOUS PO")) {
      finalAvailStatus = "Cancelled: Out of stock";
  } else if (commentsStr.includes("OOS REJECT")) {
    finalAvailStatus = "Cancelled: Out of stock";
  } else if (commentsStr.includes("MANUAL REJECT")) {
    finalAvailStatus = "Cancelled: Manual Rejection";
  } else if (expectedQty === requestedQty && requestedQty > 0) {
    // Fallback if no specific comment matched, but quantities are full
    finalAvailStatus = "Accepted: In stock";
  } else if (expectedQty === 0 && requestedQty > 0) {
    // Fallback if no specific comment matched, and quantity is 0
    finalAvailStatus = "Cancelled: Manual Rejection";
  } else {
    // Default or original status if no other rule applies
    finalAvailStatus = "Accepted: In stock"; // Assume in stock if nothing else is specified and expected quantity is not 0.
  }


  // Clean up comments for display if it's just "ACCEPTED"
  let finalComments = commentsArr.join(' | ');
  if (!finalComments && expectedQty === requestedQty && requestedQty > 0) {
    finalComments = "ACCEPTED";
  } else if (!finalComments && expectedQty === 0 && requestedQty > 0) {
    finalComments = "MANUAL REJECT"; // Default if no comment but quantity is 0
  }
  
  // Recalculate Total Cancelled based on new isRejected flag and expectedQty
  const totalCancelled = isRejected || expectedQty === 0 ? (requestedQty * unitCost) : 0;

  return {
    ...row,
    'Estimated Delivery Date': finalEstDate,
    'Availability Status': finalAvailStatus,
    'Expected Quantity': expectedQty,
    'Units per Outer': unitsPerOuter > 0 ? unitsPerOuter : "N/A", // Store valid number or N/A
    'Unit Cost': unitCost,
    'Line Total': expectedQty * unitCost,
    'Total Cancelled': totalCancelled,
    'Nb of Cartons': unitsPerOuter > 0 ? expectedQty / unitsPerOuter : 0,
    'Rejection Comments': finalComments,
    isRejected,
    hasError
  };
};