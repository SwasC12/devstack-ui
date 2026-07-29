import { Pipe, PipeTransform } from '@angular/core';

// SAST is UTC+2, no DST.
const SAST_OFFSET = 2 * 60 * 60 * 1000;

@Pipe({ name: 'zar' })
export class ZarPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return 'R 0.00';
    return 'R ' + value.toFixed(2);
  }
}

@Pipe({ name: 'sast' })
export class SastPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    const sast = new Date(d.getTime() + SAST_OFFSET);
    return sast.toISOString().replace('T', ' ').substring(0, 19);
  }
}

@Pipe({ name: 'sastDate' })
export class SastDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    const sast = new Date(d.getTime() + SAST_OFFSET);
    return sast.toLocaleDateString('en-ZA', { timeZone: 'UTC' });
  }
}
