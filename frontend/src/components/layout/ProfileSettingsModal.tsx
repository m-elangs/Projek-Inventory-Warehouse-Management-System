import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import type { AuthUser } from '@/types/domain';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/FormControls';

export function ProfileSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, updateUser } = useAuthStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.put<AuthUser>('/auth/profile', {
        name,
        phone: phone || null,
        current_password: newPassword ? currentPassword : null,
        new_password: newPassword || null,
        new_password_confirmation: newPassword ? confirmPassword : null,
      }),
    onSuccess: (updated) => {
      updateUser(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      pushToast({ type: 'success', title: 'Operator profile updated' });
      onClose();
    },
    onError: (err) => {
      pushToast({
        type: 'error',
        title: 'Profile update failed',
        description: err instanceof ApiError ? err.message : 'Verify password fields.',
      });
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Operator Profile & Security"
      description={`${user?.employee_code} · ${user?.role?.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            disabled={!name.trim()}
            onClick={() => mutation.mutate()}
          >
            Save Profile
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <FormField label="Full Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

        <FormField label="Work Email">
          <Input value={user?.email ?? ''} disabled />
        </FormField>

        <FormField label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62..." />
        </FormField>

        <div className="pt-2 border-t border-line space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Change Password (Optional)
          </div>
          <FormField label="Current Password">
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </FormField>
          <FormField label="New Password">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </FormField>
          <FormField label="Confirm New Password">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
