import { describe, it, expect, vi } from 'vitest';
import { InventorySpecialist } from '../src/specialists/inventory-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { parseLocalIntent } from '../src/parser/local-parser.js';
import { applyPrescriptionDraftFieldsCommandSchema } from '../src/ui-commands.js';

describe('Inventory Control Specialist (PROMPT 13)', () => {
  const specialist = new InventorySpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_doc_inv_101',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: '65f1a2b3c4d5e6f7a8b9c0d1',
    boundQueueEntryId: 'q_curr_101',
    sessionToken: 'token_doc_inv',
  };

  const unboundContext: ToolExecutionContext = {
    sessionId: 'sess_unbound_102',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_unbound',
  };

  // Mock Backend Inventory Items
  const mockInventoryItems = [
    {
      _id: 'med_aug_625',
      name: 'Augmentin 625',
      genericName: 'Amoxicillin + Clavulanic Acid',
      dosageForm: 'Tablet',
      strength: '625mg',
      stockQuantity: 45,
      reorderLevel: 10,
      clinicId: 'clinic_alpha',
    },
    {
      _id: 'med_para_500',
      name: 'Paracetamol',
      genericName: 'Acetaminophen',
      dosageForm: 'Tablet',
      strength: '500mg',
      stockQuantity: 120,
      reorderLevel: 20,
      clinicId: 'clinic_alpha',
    },
    {
      _id: 'med_amox_250',
      name: 'Amoxicillin',
      genericName: 'Amoxicillin',
      dosageForm: 'Syrup',
      strength: '250mg/5ml',
      stockQuantity: 3,
      reorderLevel: 10,
      clinicId: 'clinic_alpha',
    },
    {
      _id: 'med_zero_stock',
      name: 'Azithromycin 500',
      genericName: 'Azithromycin',
      dosageForm: 'Tablet',
      strength: '500mg',
      stockQuantity: 0,
      reorderLevel: 5,
      clinicId: 'clinic_alpha',
    },
  ];

  const mockInventorySupplier = async (query: string, ctx: ToolExecutionContext) => {
    if (ctx.clinicId !== 'clinic_alpha') return [];
    if (!query) return mockInventoryItems;

    const lower = query.toLowerCase();
    return mockInventoryItems.filter(
      (item) =>
        item.name.toLowerCase().includes(lower) ||
        item.genericName.toLowerCase().includes(lower) ||
        item.strength.toLowerCase().includes(lower)
    );
  };

  const mockLowStockSupplier = async (ctx: ToolExecutionContext) => {
    if (ctx.clinicId !== 'clinic_alpha') return [];
    return mockInventoryItems.filter((item) => item.stockQuantity <= item.reorderLevel);
  };

  describe('1. Intent Parsing for Doctor Commands', () => {
    it('parses READ command "Find Augmentin 625"', () => {
      const intent = parseLocalIntent('Find Augmentin 625');
      expect(intent.kind).toBe('inventory_search');
      if (intent.kind === 'inventory_search') {
        expect(intent.query.toLowerCase()).toContain('augmentin');
      }
    });

    it('parses READ command "Is paracetamol in stock?"', () => {
      const intent = parseLocalIntent('Is paracetamol in stock?');
      expect(intent.kind).toBe('inventory_search');
      if (intent.kind === 'inventory_search') {
        expect(intent.query.toLowerCase()).toContain('paracetamol');
      }
    });

    it('parses READ command "Show low stock"', () => {
      const intent = parseLocalIntent('Show low stock');
      expect(intent.kind).toBe('low_stock');
    });

    it('parses DRAFT command "Add the selected inventory medicine to this prescription draft"', () => {
      const intent = parseLocalIntent('Add the selected inventory medicine to this prescription draft');
      expect(intent.kind).toBe('add_inventory_to_draft');
    });

    it('parses PROTECTED command "Increase stock by 20"', () => {
      const intent = parseLocalIntent('Increase stock by 20');
      expect(intent.kind).toBe('mutate_inventory_stock');
      if (intent.kind === 'mutate_inventory_stock') {
        expect(intent.mode).toBe('increase');
        expect(intent.amount).toBe(20);
      }
    });

    it('parses PROTECTED command "Set stock to 50"', () => {
      const intent = parseLocalIntent('Set stock to 50');
      expect(intent.kind).toBe('mutate_inventory_stock');
      if (intent.kind === 'mutate_inventory_stock') {
        expect(intent.mode).toBe('set');
        expect(intent.amount).toBe(50);
      }
    });
  });

  describe('2. READ Commands Execution', () => {
    it('1. "Find Augmentin 625": searches backend inventory and returns stock status (Level 1)', async () => {
      const result = await specialist.handleSearch('Augmentin 625', doctorContext, mockInventorySupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('inventory_item');
      if (result.cards[0]?.type === 'inventory_item') {
        expect(result.cards[0].name).toBe('Augmentin 625');
        expect(result.cards[0].stockQuantity).toBe(45);
        expect(result.cards[0].status).toBe('available');
      }
      expect(result.assistantText).toContain('Augmentin 625');
      expect(result.assistantText).toContain('is in stock (45 units available)');
    });

    it('2. "Is paracetamol in stock?": verifies in-stock status (Level 1)', async () => {
      const result = await specialist.handleSearch('paracetamol', doctorContext, mockInventorySupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('inventory_item');
      if (result.cards[0]?.type === 'inventory_item') {
        expect(result.cards[0].stockQuantity).toBe(120);
        expect(result.cards[0].status).toBe('available');
      }
      expect(result.assistantText).toContain('Paracetamol');
      expect(result.assistantText).toContain('120 units available');
    });

    it('3. "Show low stock": returns list of medicines at or below reorder level (Level 1)', async () => {
      const result = await specialist.handleLowStock(doctorContext, mockLowStockSupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('low_stock_list');
      if (result.cards[0]?.type === 'low_stock_list') {
        expect(result.cards[0].count).toBe(2); // Amoxicillin (3) and Azithromycin (0)
        expect(result.cards[0].items.map((i) => i.name)).toContain('Amoxicillin');
        expect(result.cards[0].items.map((i) => i.name)).toContain('Azithromycin 500');
      }
      expect(result.assistantText).toContain('2 medicines running low on stock');
    });
  });

  describe('3. DRAFT Commands & No Invented Dose Instructions Rule', () => {
    it('adds inventory medicine to unsaved prescription draft WITHOUT inventing dose instructions (Level 2)', async () => {
      const existingDraft = {
        diagnosis: 'Acute Pharyngitis',
        doctorNotes: '',
        medicines: [],
        missingFields: ['medicines'],
        warnings: [],
      };

      const result = await specialist.handleAddToDraft('Augmentin 625', existingDraft, doctorContext, mockInventorySupplier);

      expect(result.mergedDraft).toBeDefined();
      const meds = result.mergedDraft!.medicines;
      expect(meds).toHaveLength(1);

      const added = meds[0]!;
      expect(added.name).toBe('Augmentin 625');
      expect(added.dosage).toBe('625mg');

      // STRICT RULE VERIFICATION: DOSE INSTRUCTIONS MUST NOT BE INVENTED
      expect(added.frequency).toBe('');
      expect(added.duration).toBe('');
      expect(added.instructions).toBe('');

      expect(result.uiCommand).toBeDefined();
      expect(result.uiCommand?.type).toBe('APPLY_PRESCRIPTION_DRAFT_FIELDS');
      const parsedCmd = applyPrescriptionDraftFieldsCommandSchema.safeParse(result.uiCommand);
      expect(parsedCmd.success).toBe(true);
    });

    it('blocks adding to draft if patient session is NOT bound or active visit missing', async () => {
      const result = await specialist.handleAddToDraft('Augmentin 625', null, unboundContext, mockInventorySupplier);

      expect(result.error).toBe('PATIENT_NOT_BOUND');
      expect(result.mergedDraft).toBeUndefined();
      expect(result.uiCommand).toBeUndefined();
      expect(result.assistantText).toContain('requires a confirmed bound patient session');
    });
  });

  describe('4. PROTECTED Stock Mutation Commands & Level 3 Confirmation', () => {
    it('1. "Increase stock by 20": proposes Level 3 confirmation action', async () => {
      const result = await specialist.proposeStockMutation('increase', 20, 'Augmentin 625', doctorContext, mockInventorySupplier);

      expect(result.pendingAction).toBeDefined();
      expect(result.pendingAction?.type).toBe('confirm_inventory_change');
      expect(result.pendingAction?.medicineId).toBe('med_aug_625');
      expect(result.pendingAction?.previousQuantity).toBe(45);
      expect(result.pendingAction?.newQuantity).toBe(65);
      expect(result.pendingAction?.stockDelta).toBe(20);
      expect(result.assistantText).toContain('confirm to increase stock of Augmentin 625 by 20 (from 45 to 65)');
    });

    it('2. "Set stock to 50": proposes Level 3 confirmation action', async () => {
      const result = await specialist.proposeStockMutation('set', 50, 'Augmentin 625', doctorContext, mockInventorySupplier);

      expect(result.pendingAction).toBeDefined();
      expect(result.pendingAction?.type).toBe('confirm_inventory_change');
      expect(result.pendingAction?.medicineId).toBe('med_aug_625');
      expect(result.pendingAction?.previousQuantity).toBe(45);
      expect(result.pendingAction?.newQuantity).toBe(50);
      expect(result.pendingAction?.stockDelta).toBe(5);
      expect(result.assistantText).toContain('confirm to set stock of Augmentin 625 to 50 (currently 45)');
    });

    it('3. Confirms stock mutation and records backend update + audit event', async () => {
      const proposalResult = await specialist.proposeStockMutation('set', 50, 'Augmentin 625', doctorContext, mockInventorySupplier);
      const pendingAction = proposalResult.pendingAction!;

      const mockExecutor = vi.fn(async (medId: string, newStock: number, ctx: ToolExecutionContext) => {
        return {
          medicineId: medId,
          stockQuantity: newStock,
          clinicId: ctx.clinicId,
          auditEventRecorded: true,
        };
      });

      const confirmResult = await specialist.confirmStockMutation(pendingAction, doctorContext, mockExecutor);

      expect(confirmResult.success).toBe(true);
      expect(mockExecutor).toHaveBeenCalledWith('med_aug_625', 50, doctorContext);
      expect(confirmResult.assistantText).toContain('Stock of Augmentin 625 successfully updated to 50 units. Audit log recorded.');
    });
  });

  describe('5. Security, Clinic Isolation & Business Rules', () => {
    it('enforces clinic isolation: returns empty inventory for mismatched clinicId', async () => {
      const foreignContext: ToolExecutionContext = {
        ...doctorContext,
        clinicId: 'clinic_other_clinic_99',
      };

      const result = await specialist.handleSearch('Augmentin 625', foreignContext, mockInventorySupplier);
      expect(result.cards).toHaveLength(0);
      expect(result.assistantText).toContain("No medicine matching 'Augmentin 625' was found");
    });

    it('no automatic stock deduction: drafting prescription does not mutate backend stock quantity', async () => {
      const initialStock = mockInventoryItems[0]!.stockQuantity; // 45

      const existingDraft = { medicines: [] };
      await specialist.handleAddToDraft('Augmentin 625', existingDraft, doctorContext, mockInventorySupplier);

      // Stock in mock items remains unchanged
      expect(mockInventoryItems[0]!.stockQuantity).toBe(initialStock);
    });
  });
});
