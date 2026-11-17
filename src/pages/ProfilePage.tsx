import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeWards } from '../services/firestoreService';
import { MUNICIPAL_WARDS } from '../shared/catalog';
import { Ward } from '../shared/types';

export const ProfilePage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [wardId, setWardId] = useState(user?.wardId || 'ward_14');
  const [phone, setPhone] = useState(user?.phone || '');
  const [wards, setWards] = useState<Ward[]>(MUNICIPAL_WARDS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setWards(MUNICIPAL_WARDS);
      return;
    }
    const unsub = subscribeWards(setWards);
    return () => unsub();
  }, [user?.uid]);

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await updateProfile({ displayName, wardId, phone });
    setSaved(true);
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
