import React from 'react';
import {
  ArrowRight,
  Building2,
  MapPin,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CinematicIntro } from '../components/CinematicIntro';
import { AppRoute } from '../components/Navbar';
import citizenCivicActionImg from '../assets/images/citizen_civic_action_1794910702250.jpg';
import municipalCommandImg from '../assets/images/municipal_command_center_1794910701828.jpg';

interface LandingPageProps {
  onOpenAuth: (initialMode?: 'login' | 'register' | 'authority_login') => void;
  onOpenAuthorityRegister: () => void;
  onOpenDashboard: () => void;
  onNavigate: (route: AppRoute) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onOpenAuthorityRegister,
  onOpenDashboard,
  onNavigate,
}) => {
  const { user } = useAuth();
  const canExploreStaffViews = Boolean(
    user &&
      user.active &&
      (user.role === 'admin' ||
        (user.role === 'authority' &&
          user.accountStatus === 'approved' &&
          user.emailVerified !== false))
  );

  const platformRoles = [
    {
      id: 'citizen',
      title: 'Citizen Portal',
      subtitle: 'Neighborhood Reporting & Tracking',
      description:
        'Public registrations start with Citizen permissions to report potholes, waste accumulation, water leaks, or broken streetlights with GPS coordinates and site photos.',
      note: 'Assigned automatically on registration',
      Icon: User,
    },
    {
      id: 'authority',
      title: 'Municipal Authority',
      subtitle: 'Department Triage & Field Resolution',
      description:
        'Verified municipal officers review complaints scoped strictly to their authorized department and ward, dispatch field teams, and publish verified resolution updates.',
      note: 'Requires administrator verification & email confirmation',
      Icon: Building2,
    },
    {
      id: 'admin',
      title: 'Administrator',
      subtitle: 'Citywide Governance & Oversight',
      description:
        'Authorized city governance accounts verify authority requests, manage roles, municipal departments, ward boundaries, duplicate complaint reviews, analytics, and audit trails.',
      note: 'Restricted server-verified privilege',
      Icon: ShieldCheck,
    },
  ];

  return (
    <div className="bg-[#F7F9F8] overflow-x-hidden">
      <CinematicIntro
        onGetStarted={() => (user ? onOpenDashboard() : onOpenAuth('register'))}
        onExploreAction={() =>
          canExploreStaffViews ? onNavigate('gis') : user ? onOpenDashboard() : onOpenAuth('login')
        }
        primaryCtaLabel={user ? 'Open My Dashboard' : 'Report or Track a Grievance'}
        secondaryCtaLabel={
          canExploreStaffViews ? 'Explore Live GIS Map' : user ? 'View Assigned Queue' : 'Sign In'
        }
      />

      {/* Informational Platform Overview (No Role Switching) */}
      <section id="role-selection-grid" className="max-w-[1380px] mx-auto px-4 sm:px-6 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#0B3B2E] tracking-tight">
              One Platform for Civic Accountability
            </h2>
            <p className="text-sm sm:text-base text-neutral-600 mt-2">
              {user
                ? `Signed in as ${user.displayName}. Your account is verified and automatically routed to your authorized workspace.`
                : 'Register as a citizen to report grievances directly to municipal departments, or sign in to be routed to your authorized dashboard.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors whitespace-nowrap cursor-pointer"
              >
                Open My Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#059669] text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Citizen Registration
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="px-4 py-2.5 text-sm font-medium bg-white border border-neutral-300 text-[#0B3B2E] rounded-lg hover:bg-neutral-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {platformRoles.map(({ id, title, subtitle, description, note, Icon }) => (
            <div
              key={id}
              className="text-left bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0B3B2E] mb-5">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-xs font-medium text-emerald-700">{subtitle}</div>
                <h3 className="text-xl font-display font-bold text-[#0B3B2E] mt-1">{title}</h3>
                <p className="text-sm text-neutral-600 mt-3 leading-relaxed">{description}</p>
              </div>
              {id === 'authority' ? (
                <div className="mt-6 pt-4 border-t border-neutral-100 space-y-2.5">
                  {!user ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenAuth('authority_login')}
                        className="px-3.5 py-2 text-xs font-semibold bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors cursor-pointer"
                      >
                        Authority Sign In
                      </button>
                      <button
                        type="button"
                        onClick={onOpenAuthorityRegister}
                        className="px-3.5 py-2 text-xs font-semibold bg-white border border-neutral-300 text-[#0B3B2E] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
                      >
                        Request Authority Access
                      </button>
                    </div>
                  ) : user.role === 'citizen' &&
                    user.accountStatus !== 'pending_verification' &&
                    user.accountStatus !== 'suspended' ? (
                    <button
                      type="button"
                      onClick={onOpenAuthorityRegister}
                      className="text-xs font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                    >
                      Request Authority Access →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenDashboard}
                      className="text-xs font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                    >
                      View Authority Status →
                    </button>
                  )}
                  <div className="text-[11px] font-medium text-neutral-500">{note}</div>
                </div>
              ) : (
                <div className="mt-6 pt-4 border-t border-neutral-100 text-xs font-medium text-neutral-500">
                  {note}
                </div>
              )}
            </div>
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
                  onClick={() => (user ? onOpenDashboard() : onOpenAuth('register'))}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                >
                  {user ? 'Open My Dashboard' : 'Register & Report a Civic Issue'}
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
                  Authorized municipal officers and administrators analyze complaints plotted across city wards with category and priority filters, spatial duplicate detection, and department turnaround analytics.
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-wrap items-center gap-5">
                {canExploreStaffViews ? (
                  <>
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
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => (user ? onOpenDashboard() : onOpenAuth('login'))}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B3B2E] hover:text-emerald-700 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-orange-600" />
                    {user ? 'Open My Assigned Portal' : 'Sign In for Authorized Access'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
