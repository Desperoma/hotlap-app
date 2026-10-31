import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { REPORT_REASONS } from './api';

import { t } from '@/i18n/core';
/** Signalement avec le contenu visé (migration 0032). */
export type ReportItem = {
  id: string; target_type: string; target_id: string; reason: string; status: string; created_at: string;
  label: string | null; reporter?: string; details?: string | null;
};

export const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;
export const STATUS_LABEL: Record<string, string> = {
  get open() { return t('Pending review'); }, get reviewed() { return t('Reviewed'); }, get actioned() { return t('Action taken'); }, get dismissed() { return t('Dismissed'); },
};

export async function myReports(): Promise<ReportItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase.rpc('my_reports');
  return (data ?? []) as ReportItem[];
}

export async function devReports(status: string | null): Promise<ReportItem[]> {
  const { data } = await supabase.rpc('dev_reports', { p_status: status });
  return (data ?? []) as ReportItem[];
}

export async function devSetReportStatus(id: string, status: 'reviewed' | 'actioned' | 'dismissed') {
  const { error } = await supabase.rpc('dev_set_report_status', { p_report: id, p_status: status });
  if (error) throw error;
}

/** Retire un signalement : le sien, ou n'importe lequel pour un dev (migration 0033). */
export async function deleteReport(id: string) {
  const { error } = await supabase.rpc('delete_report', { p_report: id });
  if (error) throw error;
}

/** Ouvre le contenu signalé quand c'est possible. */
export const reportHref = (r: ReportItem) =>
  r.target_type === 'drive' ? `/drive/${r.target_id}` : r.target_type === 'user' ? `/user/${r.target_id}` : null;
