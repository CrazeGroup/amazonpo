import React, { useState, useMemo } from 'react';
import { ProcessedRow } from '../types';
import { ResultsTable } from './ResultsTable';

interface PivotTableProps {
  data: ProcessedRow[];
}

type GroupField = keyof ProcessedRow;

const GROUP_OPTIONS: { label: string; value: GroupField }[] = [
  { label: 'Brand', value: 'Brand' },
  { label: 'Destination Warehouse', value: 'Destination Warehouse' },
  { label: 'Vendor Code', value: 'Vendor Code' },
  { label: 'PO Number', value: 'PO Number' },
  { label: 'Availability Status', value: 'Availability Status' },
  { label: 'Rejection Comments', value: 'Rejection Comments' },
  { label: 'Code Type', value: 'Code Type' },
];

interface AggregateRow {
  groupValue: string;
  count: number;
  qtyRequested: number;
  expectedQty: number;
  lineTotal: number;
  totalCancelled: number;
  cartons: number;
  rows: ProcessedRow[];
}

export const PivotTable: React.FC<PivotTableProps> = ({ data }) => {
  const [groupBy, setGroupBy] = useState<GroupField>('Brand');
  const [globalFilter, setGlobalFilter] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<keyof AggregateRow>('lineTotal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // 1. Filter Data First (Slicer Logic)
  const filteredData = useMemo(() => {
    if (!globalFilter) return data;
    const lowerFilter = globalFilter.toLowerCase();
    
    return data.filter(row => {
      return Object.values(row).some(val => 
        String(val).toLowerCase().includes(lowerFilter)
      );
    });
  }, [data, globalFilter]);

  // 2. Group & Aggregate
  const groupedData = useMemo(() => {
    const groups: { [key: string]: AggregateRow } = {};

    filteredData.forEach(row => {
      // Get key
      const rawKey = row[groupBy];
      const key = rawKey ? String(rawKey) : '(Blank)';

      if (!groups[key]) {
        groups[key] = {
          groupValue: key,
          count: 0,
          qtyRequested: 0,
          expectedQty: 0,
          lineTotal: 0,
          totalCancelled: 0,
          cartons: 0,
          rows: []
        };
      }

      const g = groups[key];
      g.count += 1;
      g.qtyRequested += Number(row['Quantity Requested'] || 0);
      g.expectedQty += Number(row['Expected Quantity'] || 0);
      g.lineTotal += Number(row['Line Total'] || 0);
      g.totalCancelled += Number(row['Total Cancelled'] || 0);
      g.cartons += Number(row['Nb of Cartons'] || 0);
      g.rows.push(row);
    });

    return Object.values(groups);
  }, [filteredData, groupBy]);

  // 3. Sort Groups
  const sortedGroups = useMemo(() => {
    return [...groupedData].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [groupedData, sortField, sortDir]);

  // 4. Grand Totals
  const grandTotal = useMemo(() => {
    return groupedData.reduce((acc, curr) => ({
      count: acc.count + curr.count,
      qtyRequested: acc.qtyRequested + curr.qtyRequested,
      expectedQty: acc.expectedQty + curr.expectedQty,
      lineTotal: acc.lineTotal + curr.lineTotal,
      totalCancelled: acc.totalCancelled + curr.totalCancelled,
      cartons: acc.cartons + curr.cartons,
    }), { count: 0, qtyRequested: 0, expectedQty: 0, lineTotal: 0, totalCancelled: 0, cartons: 0 });
  }, [groupedData]);

  // Handlers
  const toggleGroup = (groupValue: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(groupValue)) newSet.delete(groupValue);
    else newSet.add(groupValue);
    setExpandedGroups(newSet);
  };

  const handleSort = (field: keyof AggregateRow) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc'); // Default to desc for numbers usually
    }
  };

  const formatCurrency = (val: number) => val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const formatNumber = (val: number) => val.toLocaleString();

  return (
    <div className="flex flex-col h-full bg-gray-50 min-h-[500px]">
      
      {/* Toolbar */}
      <div className="bg-white p-4 border-b border-gray-200 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm z-10">
        
        {/* Group By Control */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">Group Rows By:</span>
          <div className="relative">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupField)}
              className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-amazon-blue font-bold text-sm shadow-sm hover:border-gray-400 transition-colors cursor-pointer"
            >
              {GROUP_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        {/* Global Filter */}
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
             </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-amazon-blue focus:border-amazon-blue sm:text-sm shadow-sm transition-all"
            placeholder="Global Search (Filter all data)..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Main Aggregation Table */}
      <div className="flex-grow overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0 shadow-sm z-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-10"></th>
              <th 
                className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('groupValue')}
              >
                {groupBy} {sortField === 'groupValue' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th 
                className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('count')}
              >
                Lines {sortField === 'count' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
               <th 
                className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('qtyRequested')}
              >
                Qty Req {sortField === 'qtyRequested' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('expectedQty')}
              >
                Exp Qty {sortField === 'expectedQty' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('lineTotal')}
              >
                Total ($) {sortField === 'lineTotal' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
               <th 
                className="px-6 py-3 text-right text-xs font-bold text-red-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('totalCancelled')}
              >
                Cancelled ($) {sortField === 'totalCancelled' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th 
                className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('cartons')}
              >
                Cartons {sortField === 'cartons' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.groupValue);
              return (
                <React.Fragment key={group.groupValue}>
                  {/* Summary Row */}
                  <tr 
                    onClick={() => toggleGroup(group.groupValue)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-block transition-transform transform ${isExpanded ? 'rotate-90 text-amazon-blue' : 'text-gray-400'}`}>
                        ▶
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 text-sm">
                      {group.groupValue}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      <span className="bg-gray-100 px-2 py-1 rounded-full text-xs font-bold">{group.count}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-mono">
                      {formatNumber(group.qtyRequested)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-mono font-bold">
                       {formatNumber(group.expectedQty)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-green-700 font-mono bg-green-50/30">
                       {formatCurrency(group.lineTotal)} €
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-red-600 font-mono bg-red-50/30">
                       {group.totalCancelled > 0 ? formatCurrency(group.totalCancelled) + ' €' : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-mono">
                       {formatNumber(group.cartons)}
                    </td>
                  </tr>

                  {/* Details Expansion */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0 bg-gray-50 shadow-inner">
                        <div className="px-4 py-4 border-l-4 border-amazon-orange ml-6">
                           <div className="mb-2 text-xs font-bold text-gray-500 uppercase">
                             Details for {groupBy}: <span className="text-amazon-blue">{group.groupValue}</span>
                           </div>
                           {/* Re-use ResultsTable but in read-only mode mostly or simplified */}
                           <div className="overflow-x-auto border border-gray-200 rounded-lg">
                             <ResultsTable 
                                data={group.rows} 
                                onRowUpdate={() => {}} // Read only in pivot view
                             />
                           </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-800 text-white sticky bottom-0">
             <tr>
               <td colSpan={2} className="px-6 py-4 text-right font-bold uppercase text-xs tracking-wider">Grand Totals:</td>
               <td className="px-6 py-4 text-center font-bold font-mono">{grandTotal.count}</td>
               <td className="px-6 py-4 text-right font-bold font-mono">{formatNumber(grandTotal.qtyRequested)}</td>
               <td className="px-6 py-4 text-right font-bold font-mono text-amazon-orange">{formatNumber(grandTotal.expectedQty)}</td>
               <td className="px-6 py-4 text-right font-bold font-mono">{formatCurrency(grandTotal.lineTotal)} €</td>
               <td className="px-6 py-4 text-right font-bold font-mono text-red-300">{formatCurrency(grandTotal.totalCancelled)} €</td>
               <td className="px-6 py-4 text-right font-bold font-mono">{formatNumber(grandTotal.cartons)}</td>
             </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};