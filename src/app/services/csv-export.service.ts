import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class CsvExportService {

    constructor() { }

    /**
     * Export distribution data (bins and counts) to CSV.
     */
    exportHistogramCsv(data: { bins: string[]; counts: number[] }, variableName: string): void {
        if (!data.bins || !data.counts || data.bins.length !== data.counts.length) {
            console.warn('Invalid data for CSV export');
            return;
        }

        const headers = ['Category', 'Count'];
        const rows = data.bins.map((bin, index) => [
            `"${bin.replace(/"/g, '""')}"`, // Escape quotes for CSV
            data.counts[index]
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        this.downloadCsv(csvContent, `${variableName.replace(/[^\w\s-]/g, '').trim()}_distribution.csv`);
    }

    /**
     * General purpose CSV export for array of objects.
     */
    exportToCsv(data: any[], headers: string[], filename: string): void {
        if (!data || !data.length) return;

        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header] ?? '';
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(','))
        ].join('\n');

        this.downloadCsv(csvContent, filename);
    }

    private downloadCsv(content: string, filename: string): void {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}
