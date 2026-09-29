import { NavigateFunction } from 'react-router-dom';

export interface JarvisUICommand {
  type: string;
  targetPath?: string;
  patientId?: string;
  friendlyId?: string;
  prescriptionId?: string;
  appointmentId?: string;
  pdfUrl?: string;
  filename?: string;
  qrTokenUrl?: string;
  patientName?: string;
  draft?: any;
  filter?: string;
}

const ALLOWED_ROUTE_PREFIXES = [
  '/app/dashboard',
  '/app/patients',
  '/app/queue',
  '/app/inventory',
  '/app/prescriptions',
  '/app/prescription',
  '/app/appointments',
  '/app/communications',
  '/app/analytics',
  '/app/templates',
  '/app/settings',
];

/**
 * Validates whether a target route path is safe and allowlisted.
 */
export function isRouteAllowed(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('://') || path.startsWith('//') || path.includes('<script')) return false;
  return ALLOWED_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Central Dispatcher for executing Jarvis UI Commands on the frontend.
 */
export function dispatchJarvisUICommand(
  command: JarvisUICommand,
  navigate: NavigateFunction,
  onApplyDraft?: (draft: any) => void,
  onShowQR?: (qrData: any) => void
): boolean {
  if (!command || !command.type) return false;

  switch (command.type) {
    case 'NAVIGATE_UI': {
      if (command.targetPath && isRouteAllowed(command.targetPath)) {
        navigate(command.targetPath);
        return true;
      }
      return false;
    }

    case 'OPEN_PATIENT': {
      if (command.patientId) {
        const safeId = encodeURIComponent(command.patientId);
        navigate(`/app/patients/${safeId}`);
        return true;
      }
      return false;
    }

    case 'SHOW_QUEUE': {
      navigate('/app/queue');
      return true;
    }

    case 'OPEN_PRESCRIPTION': {
      if (command.prescriptionId) {
        const safeId = encodeURIComponent(command.prescriptionId);
        navigate(`/app/prescriptions/${safeId}/workspace`);
        return true;
      }
      return false;
    }

    case 'OPEN_PRESCRIPTION_EDITOR': {
      navigate('/app/prescription/new');
      return true;
    }

    case 'APPLY_PRESCRIPTION_DRAFT_FIELDS': {
      if (command.draft && onApplyDraft) {
        onApplyDraft(command.draft);
        return true;
      }
      return false;
    }

    case 'SHOW_QR':
    case 'OPEN_PRESCRIPTION_ACCESS': {
      if (onShowQR) {
        onShowQR(command);
        return true;
      }
      return false;
    }

    case 'OPEN_APPOINTMENT':
    case 'OPEN_APPOINTMENT_FORM': {
      navigate('/app/appointments');
      return true;
    }

    case 'OPEN_TEMPLATE_LIBRARY': {
      navigate('/app/templates');
      return true;
    }

    case 'OPEN_INVENTORY': {
      navigate('/app/inventory');
      return true;
    }

    case 'OPEN_COMMUNICATIONS': {
      navigate('/app/communications');
      return true;
    }

    case 'OPEN_ANALYTICS': {
      navigate('/app/analytics');
      return true;
    }

    default:
      console.warn(`[JarvisDispatcher] Unknown or unhandled UI command type: ${command.type}`);
      return false;
  }
}
