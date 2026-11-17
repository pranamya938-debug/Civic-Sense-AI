import React from 'react';
import {
  ArrowRight,
  Building2,
  MapPin,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { UserRole } from '../shared/types';
import { CinematicIntro } from '../components/CinematicIntro';
import { AppRoute } from '../components/Navbar';
import citizenCivicActionImg from '../assets/images/citizen_civic_action_1794910702250.jpg';
import municipalCommandImg from '../assets/images/municipal_command_center_1794910701828.jpg';

interface LandingPageProps {
  onSelectRole: (role: UserRole, initialMode?: 'login' | 'register') => void;
  onNavigate: (route: AppRoute) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectRole, onNavigate }) => {
  const roles: {
    role: UserRole;
    title: string;
    subtitle: string;
    description: string;
    action: string;
    Icon: React.ElementType;
  }[] = [
    {
      role: 'citizen',
      title: 'Citizen',
      subtitle: 'Neighborhood Reporting & Tracking',
      description:
        'Report potholes, waste accumulation, water leaks, or broken streetlights with GPS coordinates and site photos, and follow live status updates.',
      action: 'Open Citizen Portal',
      Icon: User,
    },
    {
      role: 'authority',
      title: 'Municipal Authority',
      subtitle: 'Department Triage & Field Resolution',
      description:
        'Review incoming grievances filtered by category, priority, and ward; assign field departments; and publish verified resolution remarks.',
      action: 'Open Authority Console',
      Icon: Building2,
    },
    {
      role: 'admin',
      title: 'Administrator',
      subtitle: 'Citywide Governance & Oversight',
      description:
        'Manage user permissions, municipal departments, ward boundaries, duplicate complaint reviews, analytics, and audit trails.',
      action: 'Open Admin Console',
      Icon: ShieldCheck,
    },
  ];

  return (
    <div className="bg-[#F7F9F8] overflow-x-hidden">
      <CinematicIntro
        onSelectRole={(r) => onSelectRole(r, 'login')}
        onExploreMap={() => onNavigate('gis')}
      />

      {/* Role Entry Points */}
      <section id="role-selection-grid" className="max-w-[1380px] mx-auto px-4 sm:px-6 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] tracking-tight">
              Choose Your Civic Workspace
            </h2>
            <p className="text-sm sm:text-base text-neutral-600 mt-2">
              Sign in or create a citizen account to report issues directly to municipal departments and track resolution progress in real time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onSelectRole('citizen', 'register')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#059669] text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Citizen Registration
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('citizen', 'login')}
              className="px-4 py-2.5 text-sm font-medium bg-white border border-neutral-300 text-[#0B3B2E] rounded-lg hover:bg-neutral-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              Member Sign In
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {roles.map(({ role, title, subtitle, description, action, Icon }) => (
            <button
              key={role}
              type="button"
              onClick={() => onSelectRole(role, 'login')}
              className="group text-left bg-white border border-neutral-200 hover:border-[#059669] rounded-xl p-6 flex flex-col justify-between transition-all cursor-pointer"
            >
              <div>
                <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0B3B2E] mb-5 group-hover:bg-[#0B3B2E] group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-xs font-medium text-emerald-700">{subtitle}</div>
                <h3 className="text-xl font-display font-bold text-[#0B3B2E] mt-1">{title}</h3>
                <p className="text-sm text-neutral-600 mt-3 leading-relaxed">{description}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between text-sm font-semibold text-[#0B3B2E] group-hover:text-emerald-700">
                <span>{action}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Civic Field Operations Showcase */}
      <section className="max-w-[1380px] mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
            <div className="h-56 overflow-hidden bg-neutral-100">
              <img
                src={citizenCivicActionImg}
                alt="Citizens capturing civic road issues with mobile GPS"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-emerald-700">Citizen Reporting</div>
                <h3 className="text-xl font-display font-bold text-[#0B3B2E] mt-1">
                  Snap Evidence, Pin GPS, Track Every Milestone
                </h3>
                <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                  Every grievance receives a unique tracking ID, automated department routing, and real-time notifications whenever municipal engineers assign teams or resolve the issue.
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => onSelectRole('citizen', 'register')}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                >
                  Report a Civic Issue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
            <div className="h-56 overflow-hidden bg-neutral-100">
              <img
                src={municipalCommandImg}
                alt="Municipal engineers coordinating ward-level complaint resolution"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-emerald-700">Spatial Dispatch & Analytics</div>
                <h3 className="text-xl font-display font-bold text-[#0B3B2E] mt-1">
                  Live OpenStreetMap GIS & Ward Accountability
                </h3>
                <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                  Explore real civic complaints plotted across city wards with category and priority filters, spatial duplicate detection, and department turnaround analytics.
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-wrap items-center gap-5">
                <button
                  type="button"
                  onClick={() => onNavigate('gis')}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-orange-600" />
                  Explore Live GIS Map
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('analytics')}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                >
                  View City Analytics
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
