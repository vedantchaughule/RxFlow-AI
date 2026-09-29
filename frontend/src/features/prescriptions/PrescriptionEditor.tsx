import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Bot, FileText, Plus, Printer, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { client, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import type { QueueEntry } from '../../types';
import { notify } from '../../ui/Feedback';
import { Page } from '../../ui/Page';
import { LoadingSkeleton, StateView } from '../../ui/States';

type MedicineDraft = {
  inventoryMedicineId?: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  stockWarning?: string;
};

type PrescriptionDraft = {
  queueEntryId: string;
  patientId: string;
  diagnosis: string;
  doctorNotes: string;
  medicines: MedicineDraft[];
  confirmed: boolean;
};

type AiDraft = {
  runId: string;
  label: string;
  requiresDoctorReview: true;
  contextSources: string[];
  disclaimer: string;
  output: {
    diagnosis: string;
    doctorNotes: string;
    medicines: MedicineDraft[];
    patientInstructions: string;
    missingFields: string[];
    conflicts: string[];
    safetyWarnings: string[];
    insufficientContext: boolean;
  };
};

type InventorySearchResult = {
  _id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  dosageForm?: string;
  strength?: string;
  stockQuantity: number;
  reorderLevel: number;
  unit: string;
  status: 'available' | 'low_stock' | 'out_of_stock';
};

const emptyMedicine = (name = '', inventoryMedicineId?: string, stockWarning?: string): MedicineDraft => ({
  inventoryMedicineId,
  name,
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
  stockWarning,
});

const defaultDraft = (): PrescriptionDraft => ({
  queueEntryId: '',
  patientId: '',
  diagnosis: '',
  doctorNotes: '',
  medicines: [],
  confirmed: false,
});

function draftKey(userId: string): string {
  return `rxflow:prescription-draft:${userId}`;
}

function restoreDraft(userId: string): PrescriptionDraft {
  try {
    const raw = window.sessionStorage.getItem(draftKey(userId));
    if (!raw) return defaultDraft();
    const value = JSON.parse(raw) as Partial<PrescriptionDraft>;
    if (!Array.isArray(value.medicines)) return defaultDraft();
    return {
      queueEntryId: typeof value.queueEntryId === 'string' ? value.queueEntryId : '',
      patientId: typeof value.patientId === 'string' ? value.patientId : '',
      diagnosis: typeof value.diagnosis === 'string' ? value.diagnosis : '',
      doctorNotes: typeof value.doctorNotes === 'string' ? value.doctorNotes : '',
      medicines: value.medicines.slice(0, 20).map((medicine) => ({
        inventoryMedicineId: typeof medicine?.inventoryMedicineId === 'string' ? medicine.inventoryMedicineId : undefined,
        name: typeof medicine?.name === 'string' ? medicine.name : '',
        dosage: typeof medicine?.dosage === 'string' ? medicine.dosage : '',
        frequency: typeof medicine?.frequency === 'string' ? medicine.frequency : '',
        duration: typeof medicine?.duration === 'string' ? medicine.duration : '',
        instructions: typeof medicine?.instructions === 'string' ? medicine.instructions : '',
        stockWarning: typeof medicine?.stockWarning === 'string' ? medicine.stockWarning : undefined,
      })),
      confirmed: false,
    };
  } catch {
    return defaultDraft();
  }
}

function queueLabel(entry: QueueEntry): string {
  const patient = entry.patient;
  return `${String(entry.queueNumber).padStart(2, '0')} - ${patient?.name ?? 'Patient'}${patient ? `, ${patient.age} years` : ''}`;
}

// Single Medicine Finder Combobox Component
function MedicineFinder({ onSelect }: { onSelect: (item: { name: string; inventoryMedicineId?: string; stockWarning?: string }) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const searchResults = useQuery({
    queryKey: ['inventory-search', debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: async () => {
      const { data } = await client.get('/inventory/search', { params: { q: debouncedQuery, page: 1, limit: 10 } });
      return data.data as InventorySearchResult[];
    },
  });

  const results = searchResults.data ?? [];
  const hasMinChars = debouncedQuery.length >= 2;

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectMedicine = (item: InventorySearchResult) => {
    let warning: string | undefined;
    if (item.status === 'out_of_stock') {
      warning = `Warning: ${item.name} is currently OUT OF STOCK (${item.stockQuantity} ${item.unit})`;
    } else if (item.status === 'low_stock') {
      warning = `Low stock notice: Only ${item.stockQuantity} ${item.unit} remaining`;
    }
    onSelect({ name: item.name, inventoryMedicineId: item._id, stockWarning: warning });
    setSearchTerm('');
    setIsOpen(false);
  };

  const selectCustom = () => {
    if (!searchTerm.trim()) return;
    onSelect({ name: searchTerm.trim() });
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsOpen(true);
      return;
    }

    const totalOptions = results.length + (searchTerm.trim() ? 1 : 0);
    if (totalOptions === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalOptions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < results.length) {
        selectMedicine(results[selectedIndex]);
      } else {
        selectCustom();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="medicine-finder-combobox full" ref={containerRef} style={{ position: 'relative', marginBottom: '16px' }}>
      <label htmlFor="medicine-finder-input" style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>
        Find a medicine
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id="medicine-finder-input"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="medicine-finder-listbox"
          aria-autocomplete="list"
          placeholder="Search name, generic name, brand, strengthâ€¦"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          style={{ width: '100%', paddingLeft: '36px' }}
        />
        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted, #6b7280)' }} />
      </div>

      {isOpen && (hasMinChars || searchTerm.trim()) && (
        <ul
          id="medicine-finder-listbox"
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            zIndex: 50,
            maxHeight: '280px',
            overflowY: 'auto',
            listStyle: 'none',
            margin: '4px 0 0 0',
            padding: '4px 0',
          }}
        >
          {searchResults.isLoading && (
            <li style={{ padding: '8px 16px', color: 'var(--color-muted, #6b7280)', fontSize: '0.875rem' }}>
              Searching clinic inventoryâ€¦
            </li>
          )}

          {results.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={item._id}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectMedicine(item)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-highlight, #f3f4f6)' : 'transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border-subtle, #f3f4f6)',
                }}
              >
                <div>
                  <strong>{item.name}</strong>
                  {item.strength && <span style={{ marginLeft: '6px', fontSize: '0.85rem' }}>({item.strength})</span>}
                  <small style={{ display: 'block', color: 'var(--color-muted, #6b7280)' }}>
                    {[item.genericName, item.brandName, item.dosageForm].filter(Boolean).join(' Â· ')}
                  </small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 600,
                      backgroundColor: item.status === 'out_of_stock' ? '#fee2e2' : item.status === 'low_stock' ? '#fef3c7' : '#d1fae5',
                      color: item.status === 'out_of_stock' ? '#991b1b' : item.status === 'low_stock' ? '#92400e' : '#065f46',
                    }}
                  >
                    {item.status === 'out_of_stock' ? 'Out of stock' : item.status === 'low_stock' ? `Low stock (${item.stockQuantity})` : `In stock (${item.stockQuantity})`}
                  </span>
                </div>
              </li>
            );
          })}

          {!searchResults.isLoading && results.length === 0 && hasMinChars && (
            <li style={{ padding: '8px 16px', color: 'var(--color-muted, #6b7280)', fontSize: '0.875rem' }}>
              No inventory medicine matching "{debouncedQuery}"
            </li>
          )}

          {searchTerm.trim() && (
            <li
              role="option"
              aria-selected={selectedIndex === results.length}
              onClick={selectCustom}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                backgroundColor: selectedIndex === results.length ? 'var(--color-highlight, #f3f4f6)' : '#fafafa',
                borderTop: '1px solid var(--color-border, #e5e7eb)',
                color: 'var(--color-primary, #2563eb)',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              + Use a medicine not listed in clinic inventory: "{searchTerm.trim()}"
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function PrescriptionEditor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const requestedPatientId = new URLSearchParams(location.search).get('patientId') ?? '';
  const [draft, setDraft] = useState<PrescriptionDraft>(() => (user ? restoreDraft(user._id) : defaultDraft()));
  const [finalPrescriptionId, setFinalPrescriptionId] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [aiError, setAiError] = useState('');
  const aiAbort = useRef<AbortController | null>(null);

  const activeQueue = useQuery({
    queryKey: ['prescription-active-queue'],
    enabled: user?.role === 'doctor',
    queryFn: async () => (await client.get('/patients/queue', { params: { status: 'in_consultation', page: 1, limit: 100 } })).data.data as QueueEntry[],
  });
  const eligibleEntries = useMemo(() => activeQueue.data?.filter((entry) => entry.doctorId === user?._id) ?? [], [activeQueue.data, user?._id]);
  const selected = eligibleEntries.find((entry) => entry._id === draft.queueEntryId);

  useEffect(() => {
    if (!user || finalPrescriptionId) return;
    window.sessionStorage.setItem(draftKey(user._id), JSON.stringify({ ...draft, confirmed: false }));
  }, [draft, finalPrescriptionId, user]);

  useEffect(() => {
    if (!requestedPatientId || draft.queueEntryId || !eligibleEntries.length) return;
    const matching = eligibleEntries.find((entry) => entry.patientId === requestedPatientId);
    if (matching) setDraft((current) => ({ ...current, queueEntryId: matching._id, patientId: matching.patientId, confirmed: false }));
  }, [draft.queueEntryId, eligibleEntries, requestedPatientId]);

  useEffect(() => {
    const applyPayload = (detail: { diagnosis?: string; doctorNotes?: string; medicines?: MedicineDraft[] } | undefined) => {
      if (!detail || !Array.isArray(detail.medicines) || detail.medicines.length === 0) return;
      changeDraft((current) => ({
        ...current,
        diagnosis: detail.diagnosis?.trim() || current.diagnosis,
        doctorNotes: detail.doctorNotes?.trim() || current.doctorNotes,
        medicines: detail.medicines!.slice(0, 20).map((medicine, index) => {
          const existing = current.medicines[index];
          return {
            inventoryMedicineId: medicine.inventoryMedicineId || existing?.inventoryMedicineId,
            name: medicine.name?.trim() || existing?.name || '',
            dosage: medicine.dosage?.trim() || existing?.dosage || '',
            frequency: medicine.frequency?.trim() || existing?.frequency || '',
            duration: medicine.duration?.trim() || existing?.duration || '',
            instructions: medicine.instructions?.trim() || existing?.instructions || '',
          };
        }),
        confirmed: false,
      }));
      notify.success('Jarvis draft applied for doctor review. Clinician confirmation is still required.');
    };
    const stored = window.sessionStorage.getItem('rxflow:jarvis-pending-draft');
    if (stored) {
      window.sessionStorage.removeItem('rxflow:jarvis-pending-draft');
      try {
        applyPayload(JSON.parse(stored) as { diagnosis?: string; doctorNotes?: string; medicines?: MedicineDraft[] });
      } catch {
        /* Invalid local draft is ignored. */
      }
    }
    const applyJarvisDraft = (event: Event) => {
      applyPayload((event as CustomEvent<{ diagnosis?: string; doctorNotes?: string; medicines?: MedicineDraft[] }>).detail);
    };
    window.addEventListener('rxflow:jarvis-prescription-draft', applyJarvisDraft);
    return () => window.removeEventListener('rxflow:jarvis-prescription-draft', applyJarvisDraft);
  }, []);

  const changeDraft = (update: (current: PrescriptionDraft) => PrescriptionDraft) => setDraft((current) => ({ ...update(current), confirmed: false }));

  const handleAddMedicineFromFinder = (selectedItem: { name: string; inventoryMedicineId?: string; stockWarning?: string }) => {
    // Check if item already exists in draft
    if (selectedItem.inventoryMedicineId) {
      const exists = draft.medicines.some((m) => m.inventoryMedicineId === selectedItem.inventoryMedicineId);
      if (exists) {
        notify.error(`"${selectedItem.name}" is already added to this prescription.`);
        return;
      }
    }

    changeDraft((current) => ({
      ...current,
      medicines: [...current.medicines, emptyMedicine(selectedItem.name, selectedItem.inventoryMedicineId, selectedItem.stockWarning)],
    }));
    notify.success(`Added ${selectedItem.name} to prescription draft.`);
  };

  const finalize = useMutation({
    mutationFn: async () =>
      (
        await client.post('/prescriptions', {
          patientId: draft.patientId,
          queueEntryId: draft.queueEntryId,
          diagnosis: draft.diagnosis,
          doctorNotes: draft.doctorNotes,
          medicines: draft.medicines.map((m) => ({
            inventoryMedicineId: m.inventoryMedicineId || undefined,
            name: m.name.trim(),
            dosage: m.dosage.trim(),
            frequency: m.frequency.trim(),
            duration: m.duration.trim(),
            instructions: m.instructions.trim(),
          })),
          clinicianConfirmed: draft.confirmed,
        })
      ).data.data as { prescription: { _id: string } },
    onSuccess: (data) => {
      if (!user) return;
      window.sessionStorage.removeItem(draftKey(user._id));
      setFinalPrescriptionId(data.prescription._id);
      void queryClient.invalidateQueries({ queryKey: ['queue'] });
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      notify.success('Final clinician-reviewed prescription saved. No external delivery is confirmed.');
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  const print = useMutation({
    mutationFn: async () => (await client.get(`/prescriptions/${finalPrescriptionId}/pdf`, { responseType: 'blob' })).data as Blob,
    onSuccess: (pdf) => {
      const url = URL.createObjectURL(pdf);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  const assist = useMutation({
    mutationFn: async () => {
      aiAbort.current = new AbortController();
      return (
        await client.post(
          '/ai/prescription-assist',
          {
            task: 'structured_draft',
            notes: aiNotes,
            patientId: draft.patientId || undefined,
            draft: {
              diagnosis: draft.diagnosis,
              doctorNotes: draft.doctorNotes,
              medicines: draft.medicines.map((m) => ({
                inventoryMedicineId: m.inventoryMedicineId || undefined,
                name: m.name,
                dosage: m.dosage,
                frequency: m.frequency,
                duration: m.duration,
                instructions: m.instructions,
              })),
            },
          },
          { signal: aiAbort.current.signal, timeout: 60000 },
        )
      ).data.data as AiDraft;
    },
    onSuccess: (value) => {
      setAiDraft(value);
      setAiError('');
    },
    onError: (error) => setAiError(errorMessage(error)),
    onSettled: () => {
      aiAbort.current = null;
    },
  });

  const rejectAi = useMutation({
    mutationFn: () => client.post(`/ai/runs/${aiDraft?.runId}/reject`, { reason: 'incorrect' }),
    onSuccess: () => {
      setAiDraft(null);
      notify.success('AI draft rejected and audited');
    },
    onError: (error) => setAiError(errorMessage(error)),
  });

  const applyAiDraft = () => {
    if (!aiDraft) return;
    changeDraft((current) => ({
      ...current,
      diagnosis: aiDraft.output.diagnosis.trim() || current.diagnosis,
      doctorNotes: aiDraft.output.doctorNotes.trim() || current.doctorNotes,
      medicines: aiDraft.output.medicines.length
        ? aiDraft.output.medicines.map((medicine, index) => {
            const existing = current.medicines[index];
            return {
              inventoryMedicineId: medicine.inventoryMedicineId || existing?.inventoryMedicineId,
              name: medicine.name.trim() || existing?.name || '',
              dosage: medicine.dosage.trim() || existing?.dosage || '',
              frequency: medicine.frequency.trim() || existing?.frequency || '',
              duration: medicine.duration.trim() || existing?.duration || '',
              instructions: medicine.instructions.trim() || existing?.instructions || '',
            };
          })
        : current.medicines,
      confirmed: false,
    }));
  };

  if (user?.role !== 'doctor') return <Navigate to="/app" replace />;
  if (finalPrescriptionId)
    return (
      <Page title="Prescription finalized" subtitle="The final clinical record is immutable. You can generate patient access via secure link and QR code.">
        <section className="panel prescription-finalized">
          <FileText size={30} color="#2563eb" />
          <h2>Queue visit completed & PDF generated</h2>
          <p>The patient visit is complete and the prescription PDF is ready. Click below to open the prescription workspace to generate patient access via QR code or secure link.</p>
          <div className="dialog-actions" style={{ marginTop: '20px', gap: '12px' }}>
            <button className="button" onClick={() => navigate(`/app/prescriptions/${finalPrescriptionId}/workspace`)}>
              <FileText size={16} /> Open prescription workspace & generate access
            </button>
            <button className="button ghost" disabled={print.isPending} onClick={() => print.mutate()}>
              <Printer size={16} /> {print.isPending ? 'Preparing PDF...' : 'Open printable PDF'}
            </button>
            <button className="button ghost" onClick={() => navigate(`/app/patients/${draft.patientId}`)}>
              View patient history
            </button>
          </div>
        </section>
      </Page>
    );

  return (
    <Page title="New prescription" subtitle="Select an active consultation, search clinic inventory for medicines, review every field, then finalize once. Nothing is sent automatically.">
      <section className="panel ai-assist" aria-label="AI draft assistance">
        <p className="eyebrow">
          <Bot size={15} /> Draft assistance
        </p>
        <h2>Structure doctor notes</h2>
        <p className="muted">AI cannot diagnose, finalize, change queue state, contact patients, or override you.</p>
        <label>
          Doctor notes for AI assistance
          <textarea value={aiNotes} onChange={(event) => setAiNotes(event.target.value)} placeholder="Notes to structure into a reviewable draft" />
        </label>
        <div className="ai-actions">
          <button type="button" className="button small" disabled={assist.isPending || !aiNotes.trim()} onClick={() => assist.mutate()}>
            {assist.isPending ? 'Creating draftâ€¦' : 'Create AI draft'}
          </button>
          {assist.isPending && (
            <button type="button" className="button small ghost" onClick={() => aiAbort.current?.abort()}>
              <X size={15} /> Cancel
            </button>
          )}
        </div>
        {aiError && <p className="form-error" role="alert">{aiError} You can retry or continue manually.</p>}
        {aiDraft && (
          <section className="ai-draft" aria-label="AI-generated draft">
            <strong>
              <ShieldCheck size={16} />
              {aiDraft.label}
            </strong>
            <p>{aiDraft.disclaimer}</p>
            <dl>
              <dt>Sources/context sent</dt>
              <dd>{aiDraft.contextSources.join(' Â· ')}</dd>
              <dt>Missing information</dt>
              <dd>{aiDraft.output.missingFields.join(', ') || 'None flagged'}</dd>
              <dt>Conflicts or warnings</dt>
              <dd>{[...aiDraft.output.conflicts, ...aiDraft.output.safetyWarnings].join(', ') || 'None flagged; doctor review is still required'}</dd>
            </dl>
            <div className="ai-actions">
              <button type="button" className="button small" onClick={applyAiDraft}>
                Apply draft for review
              </button>
              <button type="button" className="button small ghost" disabled={rejectAi.isPending} onClick={() => rejectAi.mutate()}>
                Reject AI draft
              </button>
            </div>
          </section>
        )}
      </section>
      <section className="panel prescription-editor">
        {activeQueue.isLoading ? (
          <LoadingSkeleton label="Loading active consultations" rows={3} />
        ) : activeQueue.isError ? (
          <StateView kind="error" title="Unable to load active consultations" message={errorMessage(activeQueue.error)} action={<button className="button small" onClick={() => void activeQueue.refetch()}>Try again</button>} />
        ) : (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              finalize.mutate();
            }}
          >
            <label className="full">
              Active consultation
              <select
                aria-label="Active consultation"
                required
                value={draft.queueEntryId}
                onChange={(event) => {
                  const entry = eligibleEntries.find((item) => item._id === event.target.value);
                  changeDraft((current) => ({ ...current, queueEntryId: entry?._id ?? '', patientId: entry?.patientId ?? '' }));
                }}
              >
                <option value="">Select a patient from your active queue</option>
                {eligibleEntries.map((entry) => (
                  <option value={entry._id} key={entry._id}>
                    {queueLabel(entry)}
                  </option>
                ))}
              </select>
              <small>Only your server-authorized in-consultation visits are shown.</small>
            </label>
            {!eligibleEntries.length && <StateView kind="empty" title="No active consultation" message="Start a patient consultation from Todayâ€™s queue before creating a prescription." />}
            {selected && (
              <p className="full prescription-patient-summary">
                <strong>{selected.patient?.name}</strong>
                <span>
                  Queue {selected.queueNumber} Â· {selected.patient?.age} years Â· {selected.patient?.gender}
                </span>
              </p>
            )}
            <label className="full">
              Diagnosis
              <textarea aria-label="Diagnosis" required minLength={2} maxLength={1000} value={draft.diagnosis} onChange={(event) => changeDraft((current) => ({ ...current, diagnosis: event.target.value }))} />
            </label>
            <label className="full">
              Doctor notes
              <textarea aria-label="Doctor notes" maxLength={2000} value={draft.doctorNotes} onChange={(event) => changeDraft((current) => ({ ...current, doctorNotes: event.target.value }))} />
            </label>

            <div className="full medicine-editor">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Structured treatment record</p>
                  <h2>Medicines</h2>
                </div>
                <button
                  type="button"
                  className="button small"
                  disabled={draft.medicines.length >= 20}
                  onClick={() => changeDraft((current) => ({ ...current, medicines: [...current.medicines, emptyMedicine()] }))}
                >
                  <Plus size={16} /> Add custom row
                </button>
              </div>

              {/* Single Medicine Finder Box */}
              <MedicineFinder onSelect={handleAddMedicineFromFinder} />

              {draft.medicines.length === 0 ? (
                <StateView kind="empty" title="No medicines added" message="Search clinic inventory above or click 'Add custom row' to add medicines to this prescription." />
              ) : (
                draft.medicines.map((medicine, index) => (
                  <fieldset className="medicine-row" key={`${index}-${medicine.name}`}>
                    <legend>Medicine {index + 1}</legend>
                    <div className="medicine-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move medicine ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() =>
                          changeDraft((current) => {
                            const medicines = [...current.medicines];
                            [medicines[index - 1], medicines[index]] = [medicines[index]!, medicines[index - 1]!];
                            return { ...current, medicines };
                          })
                        }
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move medicine ${index + 1} down`}
                        disabled={index === draft.medicines.length - 1}
                        onClick={() =>
                          changeDraft((current) => {
                            const medicines = [...current.medicines];
                            [medicines[index], medicines[index + 1]] = [medicines[index + 1]!, medicines[index + 1]!];
                            return { ...current, medicines };
                          })
                        }
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger-text"
                        aria-label={`Remove medicine ${index + 1}`}
                        onClick={() => changeDraft((current) => ({ ...current, medicines: current.medicines.filter((_, itemIndex) => itemIndex !== index) }))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {medicine.stockWarning && (
                      <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', color: '#d48806', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={16} />
                        {medicine.stockWarning}
                      </div>
                    )}
                    <div className="form-grid">
                      {(['name', 'dosage', 'frequency', 'duration'] as const).map((field) => (
                        <label key={field}>
                          {field[0].toUpperCase() + field.slice(1)}
                          <input
                            aria-label={`Medicine ${index + 1} ${field}`}
                            required
                            maxLength={field === 'frequency' ? 200 : field === 'name' ? 200 : 120}
                            value={medicine[field]}
                            onChange={(event) =>
                              changeDraft((current) => ({
                                ...current,
                                medicines: current.medicines.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: event.target.value } : item)),
                              }))
                            }
                          />
                        </label>
                      ))}
                      <label className="full">
                        Instructions
                        <textarea
                          aria-label={`Medicine ${index + 1} instructions`}
                          maxLength={500}
                          value={medicine.instructions}
                          onChange={(event) =>
                            changeDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) => (itemIndex === index ? { ...item, instructions: event.target.value } : item)),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                ))
              )}
            </div>
            <label className="full confirm">
              <input aria-label="Clinician review confirmation" required type="checkbox" checked={draft.confirmed} onChange={(event) => setDraft((current) => ({ ...current, confirmed: event.target.checked }))} />
              <span>I have personally reviewed the diagnosis, notes, and every medicine, dosage, frequency, duration, and instruction. I confirm this final prescription for the selected patient.</span>
            </label>
            <p className="full roadmap-note">Drafts are preserved only in this browser session and are cleared after finalization. The server remains the source of truth for authorization, queue completion, and final records.</p>
            <button className="button full" disabled={finalize.isPending || !draft.queueEntryId || !draft.confirmed || draft.medicines.length === 0}>
              {finalize.isPending ? 'Finalizing...' : 'Finalize prescription'}
            </button>
          </form>
        )}
      </section>
    </Page>
  );
}

