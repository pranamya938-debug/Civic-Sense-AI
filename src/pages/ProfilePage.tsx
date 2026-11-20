import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeDepartments, subscribeWards } from '../services/firestoreService';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../shared/catalog';
import { Department, Ward } from '../shared/types';

export const ProfilePage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [wardId, setWardId] = useState(user?.wardId || 'ward_14');
  const [phone, setPhone] = useState(user?.phone || '');
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [departments, setDepartments] = useState<Department[]>(MUNICIPAL_DEPARTMENTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setWards(MUNICIPAL_WARDS);
      setDepartments(MUNICIPAL_DEPARTMENTS);
      return;
    }
    const unsubWards = subscribeWards(setWards);
    const unsubDepts = subscribeDepartments(setDepartments);
    return () => {
      unsubWards();
      unsubDepts();
    };
  }, [user?.uid]);

  if (!user) return null;

  const isAuthority = user.role === 'authority';
  const assignedDeptName =
    departments.find((d) => d.id === user.departmentId)?.name || user.departmentId || 'Unassigned';
  const assignedWardName =
    wards.find((w) => w.id === user.wardId)?.name || user.wardId || 'Unassigned';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setError(null);
    try {
      await updateProfile(
        isAuthority ? { displayName, phone } : { displayName, wardId, phone }
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <div className="text-xs font-medium text-emerald-700">
            Account Profile · Firebase Authentication & Cloud Firestore
          </div>
          <h1 className="text-2xl font-display font-bold text-[#0B3B2E] mt-1">{user.displayName}</h1>
          <div className="text-xs font-mono text-neutral-500 mt-1">
            {user.email} · Role: {user.role}
          </div>
        </div>

        {saved && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg">
            Profile settings saved to Cloud Firestore.
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
            />
          </div>

          {isAuthority ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#F7F9F8] border border-neutral-200 rounded-xl">
              <div>
                <div className="text-xs font-medium text-neutral-600">Assigned Department</div>
                <div className="text-sm font-semibold text-[#0B3B2E] mt-1">{assignedDeptName}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-600">Assigned Ward</div>
                <div className="text-sm font-semibold text-[#0B3B2E] mt-1">{assignedWardName}</div>
              </div>
              <div className="sm:col-span-2 text-[11px] text-neutral-500">
                Department and ward jurisdiction are controlled by a Municipal Administrator and cannot be modified by an authority officer.
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">Home Ward</label>
              <select
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg bg-white"
              >
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Profile
          </button>
        </form>
      </div>
    </div>
  );
};
