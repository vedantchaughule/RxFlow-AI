import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, CheckCircle2, PackagePlus, Search } from 'lucide-react';
import { client, errorMessage } from '../../api';
import { notify as toast } from '../../ui/Feedback';
import { Page } from '../../ui/Page';
import { LoadingSkeleton, StateView } from '../../ui/States';

type StockStatus = 'available' | 'low_stock' | 'out_of_stock';
type InventoryMedicine = {
  _id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  dosageForm?: string;
  strength?: string;
  stockQuantity: number;
  reorderLevel: number;
  unit: string;
  status: StockStatus;
};

type MedicineForm = {
  name: string;
  genericName: string;
  brandName: string;
  dosageForm: string;
  strength: string;
  stockQuantity: string;
  reorderLevel: string;
  unit: string;
};

const emptyForm: MedicineForm = {
  name: '', genericName: '', brandName: '', dosageForm: '', strength: '',
  stockQuantity: '0', reorderLevel: '10', unit: 'units',
};

function statusLabel(status: StockStatus) {
  return status === 'low_stock' ? 'Low stock' : status === 'out_of_stock' ? 'Out of stock' : 'Available';
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | StockStatus>('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<MedicineForm>(emptyForm);

  const inventory = useQuery({
    queryKey: ['inventory', query, status],
    queryFn: async () => {
      const { data } = await client.get('/inventory', { params: { q: query || undefined, status: status || undefined, page: 1, limit: 100 } });
      return data.data as InventoryMedicine[];
    },
  });

  const create = useMutation({
    mutationFn: async () => client.post('/inventory', {
      ...form,
      stockQuantity: Number(form.stockQuantity),
      reorderLevel: Number(form.reorderLevel),
    }),
    onSuccess: async () => {
      toast.success('Medicine added to clinic inventory.');
      setForm(emptyForm);
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateStock = useMutation({
    mutationFn: async ({ id, stockQuantity }: { id: string; stockQuantity: number }) => client.patch(`/inventory/${id}/stock`, { stockQuantity }),
    onSuccess: async () => {
      toast.success('Stock quantity updated.');
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const summary = useMemo(() => {
    const items = inventory.data ?? [];
    return {
      total: items.length,
      available: items.filter((item) => item.status === 'available').length,
      low: items.filter((item) => item.status === 'low_stock').length,
      out: items.filter((item) => item.status === 'out_of_stock').length,
    };
  }, [inventory.data]);

  return <Page
    title="Medicine inventory"
    subtitle="Search clinic stock, identify shortages, and keep medicine availability visible during consultations. Medicine inventory is managed only by authorized doctors."
    action={<button className="button inventory-add" onClick={() => setShowCreate((value) => !value)}><PackagePlus size={17}/>{showCreate ? 'Close form' : 'Add medicine'}</button>}
  >
    <section className="inventory-summary" aria-label="Inventory summary">
      <article><Boxes/><strong>{summary.total}</strong><span>Visible medicines</span></article>
      <article><CheckCircle2/><strong>{summary.available}</strong><span>Available</span></article>
      <article className="warning"><AlertTriangle/><strong>{summary.low}</strong><span>Low stock</span></article>
      <article className="danger"><AlertTriangle/><strong>{summary.out}</strong><span>Out of stock</span></article>
    </section>

    {showCreate && <section className="panel inventory-create-panel">
      <div className="panel-heading"><div><p className="eyebrow">New stock item</p><h2>Add medicine</h2></div></div>
      <form className="inventory-form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <label>Medicine name<input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        <label>Generic name<input maxLength={200} value={form.genericName} onChange={(event) => setForm({ ...form, genericName: event.target.value })}/></label>
        <label>Brand name<input maxLength={200} value={form.brandName} onChange={(event) => setForm({ ...form, brandName: event.target.value })}/></label>
        <label>Dosage form<input maxLength={80} placeholder="Tablet, syrup…" value={form.dosageForm} onChange={(event) => setForm({ ...form, dosageForm: event.target.value })}/></label>
        <label>Strength<input maxLength={80} placeholder="500 mg" value={form.strength} onChange={(event) => setForm({ ...form, strength: event.target.value })}/></label>
        <label>Unit<input maxLength={40} placeholder="strips, bottles…" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}/></label>
        <label>Stock quantity<input required type="number" min="0" max="10000000" value={form.stockQuantity} onChange={(event) => setForm({ ...form, stockQuantity: event.target.value })}/></label>
        <label>Reorder level<input required type="number" min="0" max="10000000" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })}/></label>
        <button className="button" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add to inventory'}</button>
      </form>
    </section>}

    <section className="panel inventory-panel">
      <div className="inventory-toolbar">
        <label className="inventory-search"><Search size={17}/><input aria-label="Search medicine inventory" placeholder="Search medicine, brand, strength…" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
        <label><span className="sr-only">Stock filter</span><select value={status} onChange={(event) => setStatus(event.target.value as '' | StockStatus)}><option value="">All stock</option><option value="available">Available</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select></label>
      </div>

      {inventory.isLoading ? <LoadingSkeleton label="Loading medicine inventory" rows={5}/> : inventory.isError ? <StateView kind="error" title="Inventory could not load" message={errorMessage(inventory.error)} action={<button className="button" onClick={() => void inventory.refetch()}>Retry</button>}/> : (inventory.data?.length ?? 0) === 0 ? <StateView kind="empty" title="No medicines found" message={query || status ? 'Change the search or stock filter.' : 'Add the clinic’s first medicine to begin tracking stock.'}/> : <div className="inventory-grid">
        {inventory.data!.map((medicine) => <article className="inventory-card" key={medicine._id}>
          <header><div><h2>{medicine.name}</h2><p>{[medicine.genericName, medicine.brandName].filter(Boolean).join(' · ') || 'Clinic medicine'}</p></div><span data-status={medicine.status}>{statusLabel(medicine.status)}</span></header>
          <dl><div><dt>Strength</dt><dd>{medicine.strength || '—'}</dd></div><div><dt>Form</dt><dd>{medicine.dosageForm || '—'}</dd></div><div><dt>Reorder at</dt><dd>{medicine.reorderLevel} {medicine.unit}</dd></div></dl>
          <footer><div><strong>{medicine.stockQuantity}</strong><span>{medicine.unit} in stock</span></div><label>Update stock<input aria-label={`Stock for ${medicine.name}`} type="number" min="0" max="10000000" defaultValue={medicine.stockQuantity} onBlur={(event) => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 0 && next !== medicine.stockQuantity) updateStock.mutate({ id: medicine._id, stockQuantity: next }); }}/></label></footer>
        </article>)}
      </div>}
    </section>
  </Page>;
}
