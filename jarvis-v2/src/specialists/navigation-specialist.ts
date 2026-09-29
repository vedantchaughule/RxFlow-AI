import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { NAVIGATE_UI_COMMAND } from '../ui-commands.js';

export class NavigationSpecialist {
  /**
   * Safe navigation command builder (Level 0 action).
   * Generates typed UI commands for client navigation.
   */
  public handleNavigate(
    targetPath: string,
    context: ToolExecutionContext
  ) {
    // Evaluate standard safety checks
    const policyResult = evaluatePolicy('focus_approval_action', { patientId: 'mock' }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: 'Navigation control is unauthorized.',
        cards: [],
        uiCommand: null,
      };
    }

    return {
      assistantText: `Directing your view to: ${targetPath}.`,
      cards: [],
      uiCommand: {
        type: NAVIGATE_UI_COMMAND,
        targetPath,
      },
    };
  }
}
