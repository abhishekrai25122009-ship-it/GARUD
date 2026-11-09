import { useState } from 'react';
import type { SimReport } from '../engine/sim';

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  report: SimReport | null;
}

export default function ReportDialog({ open, onClose, report }: ReportDialogProps) {
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');

  if (!open) return null;

  const jsonStr = report ? JSON.stringify(report, null, 2) : '{}';

  // Generate CSV from report metrics, incidents, interventions, and limitations
  const generateCSV = (): string => {
    if (!report) return '';
    const lines: string[] = [];

    // Header
    lines.push('=== GARUD AIRSPACE DEFENSE INCIDENT REPORT ===');
    lines.push(`Report Label,"${report.label}"`);
    lines.push(`Build,"${report.build}"`);
    lines.push(`Scenario,"${report.scenario}"`);
    lines.push(`Seed,${report.seed}`);
    lines.push(`Sim Duration (s),${report.duration.toFixed(1)}`);
    lines.push(`Generated Timestamp,${new Date(report.generatedAt).toISOString()}`);
    lines.push('');

    // Metrics
    lines.push('--- SIMULATION METRICS ---');
    lines.push(`Forecast 10s Mean Error (m),${report.metrics.forecast10sMeanError !== null ? report.metrics.forecast10sMeanError.toFixed(2) : 'N/A'}`);
    lines.push(`Scored Samples,${report.metrics.scoredSamples}`);
    lines.push(`Warning Lead Time (s),${report.metrics.warningLeadTime !== null ? report.metrics.warningLeadTime.toFixed(1) : 'N/A'}`);
    lines.push('');

    // Incidents Table
    lines.push('--- INCIDENT LOG ---');
    lines.push('Sim Time (s),Track ID,Incident Type,Note');
    for (const inc of report.incidents) {
      lines.push(`${inc.t.toFixed(1)},"${inc.trackId}","${inc.type}","${inc.note.replace(/"/g, '""')}"`);
    }
    lines.push('');

    // Interventions Table
    lines.push('--- OPERATOR INTERVENTIONS ---');
    lines.push('Sim Time (s),Track ID,Assigned Heading (deg),Assigned Speed (m/s)');
    for (const intv of report.interventions) {
      lines.push(`${intv.t.toFixed(1)},"${intv.trackId}",${intv.heading.toFixed(0)},${intv.speed.toFixed(0)}`);
    }
    lines.push('');

    // Operator Notes
    lines.push('--- OPERATOR NOTES ---');
    for (const n of report.notes) {
      lines.push(`"${n.replace(/"/g, '""')}"`);
    }
    lines.push('');

    // Limitations
    lines.push('--- SYSTEM BOUNDARIES & LIMITATIONS ---');
    for (const lim of report.limitations) {
      lines.push(`"${lim.replace(/"/g, '""')}"`);
    }

    return lines.join('\n');
  };

  const csvStr = generateCSV();
  const activeContent = exportFormat === 'json' ? jsonStr : csvStr;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (exportFormat === 'json') {
      downloadFile(jsonStr, 'garud-defense-report.json', 'application/json');
    } else {
      downloadFile(csvStr, 'garud-defense-report.csv', 'text/csv');
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Export Incident Report">
      <div className="dialog report-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="report-dialog-header">
          <div>
            <div className="report-title">EXPORT INCIDENT REPORT // ARCHIVE</div>
            <div className="report-sub">Deterministic run export · Metrics, incidents, interventions & limitations</div>
          </div>
          <div className="format-toggle-group">
            <button
              type="button"
              className={`btn small ${exportFormat === 'json' ? 'active' : ''}`}
              onClick={() => setExportFormat('json')}
            >
              JSON
            </button>
            <button
              type="button"
              className={`btn small ${exportFormat === 'csv' ? 'active' : ''}`}
              onClick={() => setExportFormat('csv')}
            >
              CSV (Spreadsheet)
            </button>
          </div>
        </div>

        <pre className="report-preview-box font-mono">{activeContent}</pre>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={handleCopy}>
            {copied ? '✔ Copied to Clipboard' : '📋 Copy Text'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn primary" onClick={handleDownload}>
            📥 Download {exportFormat.toUpperCase()}
          </button>
        </div>

        <div className="dialog-footer-disclaimer">
          Synthetic simulation data generated locally. Zero external network dependencies.
        </div>
      </div>
    </div>
  );
}

function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
