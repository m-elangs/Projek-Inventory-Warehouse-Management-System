<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class ActivityAuditService
{
    public function log(
        string $module,
        string $action,
        string $description,
        ?Model $subject = null,
        array $properties = [],
        ?User $actor = null
    ): ActivityLog {
        $request = request();
        $user = $actor ?? $request?->user();

        return ActivityLog::create([
            'user_id' => $user?->id,
            'module' => $module,
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'description' => substr($description, 0, 255),
            'properties' => empty($properties) ? null : $properties,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? substr((string) $request->userAgent(), 0, 255) : null,
        ]);
    }
}
