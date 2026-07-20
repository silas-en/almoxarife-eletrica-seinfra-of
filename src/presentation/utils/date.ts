import { format } from 'date-fns';

export function parseUTCDate(dateString: string | Date | undefined | null): Date {
  if (!dateString) return new Date();
  
  if (dateString instanceof Date) {
    return dateString;
  }
  
  const isoStr = typeof dateString === 'string' ? dateString : String(dateString);
  
  // Hande YYYY-MM-DD
  const matchYMD = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchYMD) {
    const year = parseInt(matchYMD[1], 10);
    const month = parseInt(matchYMD[2], 10) - 1; // 0-indexed
    const day = parseInt(matchYMD[3], 10);
    return new Date(year, month, day);
  }

  // Handle DD/MM/YYYY
  const matchDMY = isoStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchDMY) {
    const day = parseInt(matchDMY[1], 10);
    const month = parseInt(matchDMY[2], 10) - 1; // 0-indexed
    const year = parseInt(matchDMY[3], 10);
    return new Date(year, month, day);
  }
  
  return new Date(dateString);
}

export function formatLocalDate(dateString: string | Date | undefined | null, formatStr: string, options?: any): string {
  if (!dateString) return '';
  const dateObj = parseUTCDate(dateString);
  return format(dateObj, formatStr, options);
}
