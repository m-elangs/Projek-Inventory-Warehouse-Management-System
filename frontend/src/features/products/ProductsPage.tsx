import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Archive, FolderPlus, Eye, Package } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { Category, Product } from '@/types/domain';
import { EmptyState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/TablePrimitives';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/FormControls';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';

const productSchema = z.object({
  category_id: z.coerce.number().min(1, 'Select a category'),
  sku: z.string().min(2, 'SKU is required').max(60),
  barcode: z.string().max(80).optional(),
  name: z.string().min(2, 'Product name is required').max(180),
  description: z.string().max(2000).optional(),
  unit_of_measure: z.string().min(1, 'Unit is required').max(30),
  unit_cost: z.coerce.number().min(0, 'Must be 0 or greater'),
  selling_price: z.coerce.number().min(0).optional(),
  min_stock_level: z.coerce.number().int().min(0),
  reorder_quantity: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productSchema>;

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inspectId, setInspectId] = useState<number | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => apiClient.get<Category[]>('/categories'),
  });

  const listParams = {
    search: debouncedSearch,
    category_id: categoryFilter || undefined,
    is_active: statusFilter,
    page,
    per_page: 15,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products(listParams),
    queryFn: () => apiClient.getPaginated<Product>('/products', listParams),
  });

  const { data: inspectedProduct } = useQuery({
    queryKey: queryKeys.productDetail(inspectId),
    queryFn: () => apiClient.get<Product>(`/products/${inspectId}`),
    enabled: inspectId !== null,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      category_id: 0,
      sku: '',
      barcode: '',
      name: '',
      description: '',
      unit_of_measure: 'pcs',
      unit_cost: 0,
      selling_price: 0,
      min_stock_level: 10,
      reorder_quantity: 25,
      is_active: true,
    },
  });

  const openCreate = () => {
    setEditingProduct(null);
    setImageFile(null);
    reset({
      category_id: categories[0]?.id ?? 0,
      sku: '',
      barcode: '',
      name: '',
      description: '',
      unit_of_measure: 'pcs',
      unit_cost: 0,
      selling_price: 0,
      min_stock_level: 10,
      reorder_quantity: 25,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (prod: Product) => {
    setEditingProduct(prod);
    setImageFile(null);
    reset({
      category_id: prod.category_id,
      sku: prod.sku,
      barcode: prod.barcode ?? '',
      name: prod.name,
      description: prod.description ?? '',
      unit_of_measure: prod.unit_of_measure,
      unit_cost: prod.unit_cost,
      selling_price: prod.selling_price,
      min_stock_level: prod.min_stock_level,
      reorder_quantity: prod.reorder_quantity,
      is_active: prod.is_active,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      if (imageFile) {
        const fd = new FormData();
        Object.entries(values).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
          }
        });
        fd.append('image', imageFile);
        return editingProduct
          ? apiClient.post<Product>(`/products/${editingProduct.id}`, fd)
          : apiClient.post<Product>('/products', fd);
      }

      return editingProduct
        ? apiClient.put<Product>(`/products/${editingProduct.id}`, values)
        : apiClient.post<Product>('/products', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({
        type: 'success',
        title: editingProduct ? 'Product updated' : 'Product created',
      });
      setModalOpen(false);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        Object.entries(err.fieldErrors).forEach(([f, msgs]) => {
          setError(f as keyof ProductFormValues, { message: msgs[0] });
        });
        pushToast({ type: 'error', title: 'Validation error', description: err.message });
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (prod: Product) => apiClient.delete(`/products/${prod.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      pushToast({ type: 'success', title: 'Product archived' });
      setArchiveTarget(null);
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Cannot archive product',
        description: err instanceof ApiError ? err.message : 'Operation failed.',
      });
      setArchiveTarget(null);
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/categories', {
        code: newCatCode,
        name: newCatName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewCatCode('');
      setNewCatName('');
      pushToast({ type: 'success', title: 'Category created' });
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Category error',
        description: err instanceof ApiError ? err.message : 'Failed to create category.',
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product Master Catalog"
        description="Manage SKUs, barcodes, units of measure, cost basis, and minimum stock thresholds."
        actions={
          <>
            {hasPermission('categories.manage') && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<FolderPlus className="w-3.5 h-3.5" />}
                onClick={() => setCategoryModalOpen(true)}
              >
                Categories ({categories.length})
              </Button>
            )}
            {hasPermission('products.create') && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={openCreate}
              >
                New Product
              </Button>
            )}
          </>
        }
      />

      <div className="bg-surface border border-line rounded-lg shadow-panel overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              compact
              placeholder="Search by SKU, name, or barcode..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9.5 text-sm"
            />
          </div>

          <Select
            compact
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[240px]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            compact
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[185px]"
          >
            <option value="">All Statuses</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                <th className="px-3.5 py-2.5">SKU / Barcode</th>
                <th className="px-3.5 py-2.5">Product</th>
                <th className="px-3.5 py-2.5">Category</th>
                <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                <th className="px-3.5 py-2.5 text-right">Available</th>
                <th className="px-3.5 py-2.5 text-right">Min Stock</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={7} columns={8} />
            ) : (data?.items.length ?? 0) === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<Package className="w-5 h-5" />}
                      title="No products match your filter"
                      description="Add a new SKU to begin tracking stock movements across warehouses."
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-line text-[13px]">
                {data?.items.map((prod) => (
                  <tr key={prod.id} className="hover:bg-canvas/60">
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-xs font-semibold text-ink">{prod.sku}</div>
                      {prod.barcode && (
                        <div className="font-mono text-[11px] text-ink-secondary">{prod.barcode}</div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="w-8 h-8 rounded object-cover border border-line shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-canvas border border-line flex items-center justify-center text-[10px] font-mono text-ink-muted shrink-0">
                            {prod.unit_of_measure.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-ink truncate max-w-[260px]">{prod.name}</div>
                          <div className="text-[11px] text-ink-secondary">UoM: {prod.unit_of_measure}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-secondary">{prod.category?.name ?? '—'}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(prod.unit_cost)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">
                      <span
                        className={`font-semibold ${
                          prod.is_low_stock ? 'text-status-danger' : 'text-ink'
                        }`}
                      >
                        {formatNumber(prod.available_quantity)}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                      {formatNumber(prod.min_stock_level)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge status={prod.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectId(prod.id)}
                          title="Inspect stock & ledger"
                          className="p-1.5 rounded text-ink-secondary hover:text-ink hover:bg-canvas"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {hasPermission('products.update') && (
                          <button
                            type="button"
                            onClick={() => openEdit(prod)}
                            title="Edit SKU"
                            className="p-1.5 rounded text-ink-secondary hover:text-brand hover:bg-brand-subtle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {hasPermission('products.archive') && (
                          <button
                            type="button"
                            onClick={() => setArchiveTarget(prod)}
                            title="Archive SKU"
                            className="p-1.5 rounded text-ink-secondary hover:text-status-danger hover:bg-status-danger-bg"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Create / Edit Product Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? `Edit Product — ${editingProduct.sku}` : 'Create Product SKU'}
        description="Define standardized catalog attributes, valuation cost, and reorder rules."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={handleSubmit((vals) => saveMutation.mutate(vals))}
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3.5" onSubmit={(e) => e.preventDefault()}>
          <FormField label="SKU Code" required error={errors.sku?.message}>
            <Input placeholder="e.g. NET-SW-48P" className="font-mono uppercase" {...register('sku')} />
          </FormField>

          <FormField label="Barcode (EAN / UPC / Code128)" error={errors.barcode?.message}>
            <Input placeholder="Optional scanner barcode" className="font-mono" {...register('barcode')} />
          </FormField>

          <div className="sm:col-span-2">
            <FormField label="Product Name" required error={errors.name?.message}>
              <Input placeholder="Full commercial product description" {...register('name')} />
            </FormField>
          </div>

          <FormField label="Category" required error={errors.category_id?.message}>
            <Select {...register('category_id')}>
              <option value={0}>Select category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Unit of Measurement" required error={errors.unit_of_measure?.message}>
            <Select {...register('unit_of_measure')}>
              <option value="pcs">Pieces (pcs)</option>
              <option value="unit">Unit (unit)</option>
              <option value="box">Box (box)</option>
              <option value="roll">Roll (roll)</option>
              <option value="set">Set (set)</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="pallet">Pallet (pallet)</option>
            </Select>
          </FormField>

          <FormField label="Standard Unit Cost (Rp)" required error={errors.unit_cost?.message}>
            <Input type="number" step="1" min={0} className="tabular-nums" {...register('unit_cost')} />
          </FormField>

          <FormField label="Reference Selling Price (Rp)" error={errors.selling_price?.message}>
            <Input type="number" step="1" min={0} className="tabular-nums" {...register('selling_price')} />
          </FormField>

          <FormField label="Minimum Stock Alert Level" required error={errors.min_stock_level?.message}>
            <Input type="number" min={0} className="tabular-nums" {...register('min_stock_level')} />
          </FormField>

          <FormField label="Suggested Reorder Quantity" error={errors.reorder_quantity?.message}>
            <Input type="number" min={0} className="tabular-nums" {...register('reorder_quantity')} />
          </FormField>

          <FormField label="Product Image" hint="PNG/JPG up to 2MB">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-ink-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-line-strong file:text-xs file:font-medium file:bg-canvas file:text-ink hover:file:bg-line"
            />
          </FormField>

          <div className="flex items-center pt-6">
            <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" className="rounded border-line-strong" {...register('is_active')} />
              <span>Active for procurement & warehouse operations</span>
            </label>
          </div>

          <div className="sm:col-span-2">
            <FormField label="Technical Notes / Specifications">
              <Textarea rows={2} placeholder="Storage handling instructions or specs..." {...register('description')} />
            </FormField>
          </div>
        </form>
      </Modal>

      {/* Product Detail Inspection Modal */}
      <Modal
        open={inspectId !== null}
        onClose={() => setInspectId(null)}
        title={inspectedProduct ? `${inspectedProduct.sku} — ${inspectedProduct.name}` : 'Product Details'}
        description="Warehouse stock distribution and recent ledger audit trail."
        size="lg"
      >
        {inspectedProduct && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-canvas p-3 rounded-md border border-line text-xs">
              <div>
                <div className="text-ink-secondary">Category</div>
                <div className="font-semibold text-ink mt-0.5">{inspectedProduct.category?.name}</div>
              </div>
              <div>
                <div className="text-ink-secondary">Unit Cost</div>
                <div className="font-semibold text-ink tabular-nums mt-0.5">
                  {formatCurrency(inspectedProduct.unit_cost)}
                </div>
              </div>
              <div>
                <div className="text-ink-secondary">Total Available</div>
                <div className="font-semibold text-ink tabular-nums mt-0.5">
                  {formatNumber(inspectedProduct.available_quantity)} {inspectedProduct.unit_of_measure}
                </div>
              </div>
              <div>
                <div className="text-ink-secondary">Min Stock Level</div>
                <div className="font-semibold text-ink tabular-nums mt-0.5">
                  {formatNumber(inspectedProduct.min_stock_level)} {inspectedProduct.unit_of_measure}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-2">
                Warehouse Stock Slots
              </h3>
              <div className="border border-line rounded-md overflow-hidden">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-canvas border-b border-line text-[11px] uppercase text-ink-secondary">
                    <tr>
                      <th className="px-3 py-2">Warehouse</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2 text-right">On Hand</th>
                      <th className="px-3 py-2 text-right">Reserved</th>
                      <th className="px-3 py-2 text-right">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(inspectedProduct.stocks ?? []).map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 font-mono text-xs">{s.warehouse?.code} — {s.warehouse?.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-ink-secondary">{s.location?.code ?? 'Unbinned'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.quantity_on_hand}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{s.reserved_quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{s.available_quantity}</td>
                      </tr>
                    ))}
                    {(inspectedProduct.stocks?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-xs text-ink-secondary">
                          No stock recorded in accessible warehouses.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Categories Management Modal */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Product Categories"
        description="Organize SKUs for inventory valuation and reporting."
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="w-28">
              <FormField label="Code">
                <Input
                  compact
                  placeholder="CAT-01"
                  value={newCatCode}
                  onChange={(e) => setNewCatCode(e.target.value)}
                  className="font-mono uppercase"
                />
              </FormField>
            </div>
            <div className="flex-1">
              <FormField label="Category Name">
                <Input
                  compact
                  placeholder="e.g. Cold Chain Packaging"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
              </FormField>
            </div>
            <Button
              size="sm"
              loading={createCategoryMutation.isPending}
              disabled={!newCatCode.trim() || !newCatName.trim()}
              onClick={() => createCategoryMutation.mutate()}
            >
              Add
            </Button>
          </div>

          <div className="border border-line rounded-md divide-y divide-line max-h-64 overflow-y-auto">
            {categories.map((cat) => (
              <div key={cat.id} className="px-3 py-2 flex items-center justify-between text-[13px]">
                <div>
                  <span className="font-mono text-xs font-semibold text-ink mr-2">{cat.code}</span>
                  <span className="text-ink">{cat.name}</span>
                </div>
                <Badge variant="neutral">{cat.products_count ?? 0} SKUs</Badge>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Archive Product Confirmation */}
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
        loading={archiveMutation.isPending}
        title="Archive Product SKU"
        description={`Archive ${archiveTarget?.sku} (${archiveTarget?.name})? Products with non-zero inventory cannot be archived until stock is cleared.`}
        confirmLabel="Archive SKU"
      />
    </div>
  );
}
