import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  MinusCircle,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ComplaintPriority, ComplaintStatus } from '../shared/types';

export const StatusBadge: React.FC<{ status: ComplaintStatus }> = ({ status }) => {
  const map: Record<ComplaintStatus, { cls: string; Icon: React.ElementType }> = {
    Submitted: {
      cls: 'bg-neutral-100 text-neutral-800 border-neutral-300',
      Icon: Clock,
    },
    'Under Review': {
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
      Icon: Eye,
    },
    Assigned: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      Icon: UserCheck,
    },
    'In Progress': {
      cls: 'bg-emerald-100 text-[#0B3B2E] border-emerald-300',
      Icon: Wrench,
    },
    Resolved: {
      cls: 'bg-[#0B3B2E] text-white border-[#0B3B2E]',
      Icon: CheckCircle2,
    },
    Rejected: {
      cls: 'bg-red-50 text-red-800 border-red-200',
      Icon: XCircle,
    },
  };

  const { cls, Icon } = map[status] || map.Submitted;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {status}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: ComplaintPriority }> = ({ priority }) => {
  const map: Record<ComplaintPriority, { cls: string; Icon: React.ElementType }> = {
    Critical: {
      cls: 'bg-orange-600 text-white border-orange-600',
      Icon: AlertOctagon,
    },
    High: {
      cls: 'bg-orange-50 text-orange-800 border-orange-300',
      Icon: AlertTriangle,
    },
    Medium: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      Icon: MinusCircle,
    },
    Low: {
      cls: 'bg-neutral-50 text-neutral-700 border-neutral-200',
      Icon: MinusCircle,
    },
  };

  const { cls, Icon } = map[priority] || map.Medium;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {priority} Priority
    </span>
  );
};
