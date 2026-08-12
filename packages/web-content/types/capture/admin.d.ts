declare const _exports: {
    summarise: typeof summarise;
    toCsv: typeof toCsv;
    csvCell: typeof csvCell;
    EXPORT_COLUMNS: string[];
};
export = _exports;
/**
 * Totals and breakdowns for the admin view.
 *
 * @param {Object[]} records
 * @returns {{ total: number, byPurpose: Object<string, number>, byEdition: Object<string, number>, uniqueEmails: number }}
 */
declare function summarise(records: Object[]): {
    total: number;
    byPurpose: Record<string, number>;
    byEdition: Record<string, number>;
    uniqueEmails: number;
};
/**
 * Neutralises a value against spreadsheet formula interpretation, then escapes it for CSV.
 *
 * @param {*} value
 * @returns {string}
 */
declare function csvCell(value: any): string;
/**
 * Renders the records as CSV.
 *
 * @param {Object[]} records
 * @param {{ columns?: string[] }} [options]
 * @returns {string}
 */
declare function toCsv(records: Object[], options?: {
    columns?: string[];
}): string;
