<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\SystemSetting;
use App\Services\ActivityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettingController extends Controller
{
    public function __construct(
        private readonly ActivityAuditService $audit
    ) {}

    public function index(): JsonResponse
    {
        $settings = SystemSetting::orderBy('setting_group')->orderBy('setting_key')->get();

        $mapped = [];
        foreach ($settings as $item) {
            $mapped[$item->setting_key] = [
                'value' => SystemSetting::getValue($item->setting_key),
                'group' => $item->setting_group,
                'type' => $item->value_type,
                'updated_at' => $item->updated_at?->toISOString(),
            ];
        }

        return $this->success($mapped, 'System settings retrieved.');
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name' => ['required', 'string', 'max:150'],
            'company_email' => ['nullable', 'email', 'max:150'],
            'currency_code' => ['required', 'string', 'size:3'],
            'po_prefix' => ['required', 'string', 'max:10', 'alpha_num'],
            'transfer_prefix' => ['required', 'string', 'max:10', 'alpha_num'],
            'adjustment_prefix' => ['required', 'string', 'max:10', 'alpha_num'],
            'receipt_prefix' => ['required', 'string', 'max:10', 'alpha_num'],
            'low_stock_threshold_default' => ['required', 'integer', 'min:0', 'max:100000'],
            'require_adjustment_approval' => ['required', 'boolean'],
        ]);

        DB::transaction(function () use ($validated, $request) {
            $types = [
                'company_name' => ['organization', 'string'],
                'company_email' => ['organization', 'string'],
                'currency_code' => ['organization', 'string'],
                'po_prefix' => ['documents', 'string'],
                'transfer_prefix' => ['documents', 'string'],
                'adjustment_prefix' => ['documents', 'string'],
                'receipt_prefix' => ['documents', 'string'],
                'low_stock_threshold_default' => ['inventory', 'integer'],
                'require_adjustment_approval' => ['inventory', 'boolean'],
            ];

            foreach ($validated as $key => $val) {
                [$group, $type] = $types[$key];
                SystemSetting::updateOrCreate(
                    ['setting_key' => $key],
                    [
                        'setting_group' => $group,
                        'setting_value' => is_bool($val) ? ($val ? '1' : '0') : (string) ($val ?? ''),
                        'value_type' => $type,
                        'updated_by' => $request->user()->id,
                    ]
                );
            }

            $this->audit->log('settings', 'updated', 'Updated organization and inventory system settings.', null, $validated);
        });

        return $this->index();
    }

    public function activityLogs(Request $request): JsonResponse
    {
        $query = ActivityLog::with('user:id,name,email,employee_code');

        if ($module = trim((string) $request->query('module', ''))) {
            $query->where('module', $module);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where('description', 'like', "%{$search}%");
        }

        $paginator = $query->orderByDesc('id')
            ->paginate($this->safePerPage($request->query('per_page'), 20));

        return $this->paginated($paginator, 'Activity audit logs retrieved.');
    }
}
