import crypto from 'node:crypto';
import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { createApplyDraftCommand } from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';
import type { PrescriptionDraft } from '../types.js';
import { PrescriptionDraftSpecialist } from './prescription-draft-specialist.js';

export type InventoryItemCard = {
  type: 'inventory_item';
  medicineId: string;
  name: string;
  dosageForm: string;
  strength: string;
  stockQuantity: number;
  reorderLevel: number;
  isLowStock: boolean;
  status: 'available' | 'low_stock' | 'out_of_stock';
};

export type InventoryListCard = {
  type: 'inventory_list';
  items: InventoryItemCard[];
  totalFound: number;
};

export type LowStockListCard = {
  type: 'low_stock_list';
  items: Array<{
    medicineId: string;
    name: string;
    stockQuantity: number;
    reorderLevel: number;
  }>;
  count: number;
};

export type PendingInventoryAction = {
  actionId: string;
  type: 'confirm_inventory_change';
  medicineId: string;
  medicineName: string;
  previousQuantity: number;
  newQuantity: number;
  stockDelta: number;
  expiresAt: string;
};

export type InventoryTurnResult = {
  assistantText: string;
  cards: Array<InventoryItemCard | InventoryListCard | LowStockListCard>;
  pendingAction?: PendingInventoryAction | null;
  mergedDraft?: PrescriptionDraft;
  uiCommand?: UICommand | null;
  error?: string;
  statusCode?: number;
};

export class InventorySpecialist {
  private readonly draftSpecialist = new PrescriptionDraftSpecialist();

  /**
   * READ: Search inventory by name or query (Risk Level 1)
   * Example: "Find Augmentin 625", "Is paracetamol in stock?"
   */
  public async handleSearch(
    query: string,
    context: ToolExecutionContext,
    supplier?: (q: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<InventoryTurnResult> {
    // 1. Evaluate Doctor Control Policy (search_inventory is Level 1)
    const policyResult = evaluatePolicy('search_inventory', { query }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    // 2. Fetch inventory records from supplier or backend client
    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(query, context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: `No medicine matching '${query}' was found in your clinic inventory.`,
        cards: [],
      };
    }

    const items: InventoryItemCard[] = rawItems.map((item) => {
      const stock = Number(item.stockQuantity ?? 0);
      const reorder = Number(item.reorderLevel ?? 0);
      const status: 'available' | 'low_stock' | 'out_of_stock' =
        stock === 0 ? 'out_of_stock' : stock <= reorder ? 'low_stock' : 'available';

      return {
        type: 'inventory_item',
        medicineId: String(item.medicineId || item._id),
        name: item.name,
        dosageForm: item.dosageForm || '',
        strength: item.strength || '',
        stockQuantity: stock,
        reorderLevel: reorder,
        isLowStock: stock <= reorder,
        status,
      };
    });

    if (items.length === 1) {
      const item = items[0]!;
      const stockDesc =
        item.status === 'out_of_stock'
          ? 'is currently OUT OF STOCK (0 units)'
          : item.status === 'low_stock'
          ? `is LOW IN STOCK (${item.stockQuantity} units remaining, reorder level ${item.reorderLevel})`
          : `is in stock (${item.stockQuantity} units available)`;

      return {
        assistantText: `${item.name}${item.strength ? ' ' + item.strength : ''} ${stockDesc}.`,
        cards: items,
      };
    }

    return {
      assistantText: `Found ${items.length} medicines matching '${query}' in clinic inventory.`,
      cards: [{ type: 'inventory_list', items, totalFound: items.length }],
    };
  }

  /**
   * READ: List low stock medicines (Risk Level 1)
   * Example: "Show low stock"
   */
  public async handleLowStock(
    context: ToolExecutionContext,
    supplier?: (ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<InventoryTurnResult> {
    // 1. Evaluate Policy (get_low_stock is Level 1)
    const policyResult = evaluatePolicy('get_low_stock', {}, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: 'All clinic medicines are currently above reorder stock thresholds. No low stock items.',
        cards: [],
      };
    }

    const lowStockItems = rawItems.map((item) => ({
      medicineId: String(item.medicineId || item._id),
      name: item.name,
      stockQuantity: Number(item.stockQuantity ?? 0),
      reorderLevel: Number(item.reorderLevel ?? 0),
    }));

    return {
      assistantText: `There are ${lowStockItems.length} medicines running low on stock in your clinic inventory.`,
      cards: [{ type: 'low_stock_list', items: lowStockItems, count: lowStockItems.length }],
    };
  }

  /**
   * DRAFT: Add selected inventory medicine to unsaved prescription draft (Risk Level 2)
   * Example: "Add the selected inventory medicine to this prescription draft"
   * STRICT RULE: Cannot invent dose instructions (frequency, duration, instructions are left blank).
   */
  public async handleAddToDraft(
    queryOrMedicineId: string,
    existingDraft: Partial<PrescriptionDraft> | null | undefined,
    context: ToolExecutionContext,
    supplier?: (q: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<InventoryTurnResult> {
    // 1. Resolve medicine from inventory
    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(queryOrMedicineId, context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: `Cannot add to draft: no inventory medicine matching '${queryOrMedicineId}' was found.`,
        cards: [],
      };
    }

    const selectedMed = rawItems[0];
    const medName = selectedMed.name;
    const dosage = selectedMed.strength || '';

    // Create incoming draft WITHOUT inventing dose instructions
    const incomingDraft: PrescriptionDraft = {
      diagnosis: '',
      doctorNotes: '',
      medicines: [
        {
          name: medName,
          dosage,
          frequency: '', // STRICT: DO NOT INVENT FREQUENCY
          duration: '',  // STRICT: DO NOT INVENT DURATION
          instructions: '', // STRICT: DO NOT INVENT INSTRUCTIONS
        },
      ],
      missingFields: [],
      warnings: [],
    };

    // 2. Evaluate Doctor Control Policy (propose_prescription_draft is Level 2 tool, checks patient & active visit)
    const policyResult = evaluatePolicy('propose_prescription_draft', { draft: incomingDraft }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    // 3. Perform non-destructive merge preserving doctor's manual draft entries
    const mergeResult = this.draftSpecialist.mergeDrafts(existingDraft, incomingDraft, false);

    // 4. Emit typed UI command
    const patientId = context.boundPatientId!;
    const queueEntryId = context.boundQueueEntryId || undefined;
    const uiCommand = createApplyDraftCommand(patientId, queueEntryId, mergeResult.mergedDraft, mergeResult.mergedFields);

    return {
      assistantText: `Added ${medName}${dosage ? ' (' + dosage + ')' : ''} to unsaved prescription draft without dose instructions. Please review and enter frequency/duration.`,
      cards: [],
      mergedDraft: mergeResult.mergedDraft,
      uiCommand,
    };
  }

  /**
   * PROTECTED: Propose stock mutation (Risk Level 3)
   * Example: "Increase stock by 20", "Set stock to 50"
   */
  public async proposeStockMutation(
    mode: 'increase' | 'set',
    amount: number,
    queryOrMedicineId: string,
    context: ToolExecutionContext,
    supplier?: (q: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<InventoryTurnResult> {
    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(queryOrMedicineId, context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: `Cannot update stock: medicine '${queryOrMedicineId}' was not found in clinic inventory.`,
        cards: [],
      };
    }

    const medicine = rawItems[0];
    const medicineId = String(medicine.medicineId || medicine._id);
    const medicineName = medicine.name;
    const currentStock = Number(medicine.stockQuantity ?? 0);

    const newQuantity = mode === 'increase' ? currentStock + amount : amount;
    const stockDelta = mode === 'increase' ? amount : amount - currentStock;

    // Evaluate policy for Level 3 tool propose_inventory_change
    const policyResult = evaluatePolicy('propose_inventory_change', { medicineId, stockDelta, reason: `Doctor requested ${mode} stock` }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    const actionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const pendingAction: PendingInventoryAction = {
      actionId,
      type: 'confirm_inventory_change',
      medicineId,
      medicineName,
      previousQuantity: currentStock,
      newQuantity,
      stockDelta,
      expiresAt,
    };

    const actionDesc =
      mode === 'increase'
        ? `increase stock of ${medicineName} by ${amount} (from ${currentStock} to ${newQuantity})`
        : `set stock of ${medicineName} to ${newQuantity} (currently ${currentStock})`;

    return {
      assistantText: `Please confirm to ${actionDesc}.`,
      cards: [],
      pendingAction,
    };
  }

  /**
   * PROTECTED EXECUTION: Confirm and execute stock mutation, writing backend record and audit log
   */
  public async confirmStockMutation(
    pendingAction: PendingInventoryAction,
    context: ToolExecutionContext,
    executor?: (medicineId: string, newQuantity: number, ctx: ToolExecutionContext) => Promise<any>
  ): Promise<{ success: boolean; data?: any; error?: string; assistantText: string }> {
    if (new Date(pendingAction.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        error: 'EXPIRED_PROPOSAL',
        assistantText: 'Stock update proposal has expired. Please re-issue the command.',
      };
    }

    if (executor) {
      const result = await executor(pendingAction.medicineId, pendingAction.newQuantity, context);
      return {
        success: true,
        data: result,
        assistantText: `Stock of ${pendingAction.medicineName} successfully updated to ${pendingAction.newQuantity} units. Audit log recorded.`,
      };
    }

    return {
      success: true,
      data: {
        medicineId: pendingAction.medicineId,
        stockQuantity: pendingAction.newQuantity,
      },
      assistantText: `Stock of ${pendingAction.medicineName} updated to ${pendingAction.newQuantity} units.`,
    };
  }
}
