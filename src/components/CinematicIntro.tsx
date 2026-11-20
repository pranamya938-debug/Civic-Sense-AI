import React, { useEffect, useState } from 'react';
import { FastForward, PauseCircle, PlayCircle, Sparkles } from 'lucide-react';
import heroCityscapeImg from '../assets/images/hero_indian_cityscape_1794910701758.jpg';

interface CinematicIntroProps {
  onGetStarted: () => void;
  onExploreAction: () => void;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
}

const CIVIC_WAYPOINTS = [
  { id: 'waste', leftPct: 14, label: 'Roadside Waste', dept: 'Solid Waste Management', priority: 'High' },
  { id: 'pothole', leftPct: 32, label: 'Road Pothole', dept: 'Roads & Public Works', priority: 'High' },
  { id: 'footpath', leftPct: 50, label: 'Damaged Footpath', dept: 'Civic Infrastructure', priority: 'Medium' },
  { id: 'water', leftPct: 68, label: 'Water Leakage', dept: 'Water Supply Board', priority: 'Critical' },
  { id: 'drain', leftPct: 84, label: 'Drainage Overflow', dept: 'Stormwater & Sewerage', priority: 'Critical' },
];

export const CinematicIntro: React.FC<CinematicIntroProps> = ({
  onGetStarted,
  onExploreAction,
  primaryCtaLabel = 'Report or Track a Grievance',
  secondaryCtaLabel = 'Sign In',
}) => {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const [reducedMotion, setReducedMotion] = useState(Boolean(prefersReduced));
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(prefersReduced ? 3 : 0);
  const [activeWaypoint, setActiveWaypoint] = useState<number>(prefersReduced ? 4 : 0);
  const [skipped, setSkipped] = useState(Boolean(prefersReduced));

  useEffect(() => {
    if (reducedMotion || skipped) {
      setStage(3);
      setActiveWaypoint(4);
      return;
    }

    const t1 = setTimeout(() => setStage(1), 1600);
    const t2 = setTimeout(() => setStage(2), 3400);
    const t3 = setTimeout(() => setStage(3), 5200);

    const wpTimers = [
      setTimeout(() => setActiveWaypoint(0), 600),
      setTimeout(() => setActiveWaypoint(1), 2400),
      setTimeout(() => setActiveWaypoint(2), 4200),
      setTimeout(() => setActiveWaypoint(3), 6200),
      setTimeout(() => setActiveWaypoint(4), 8200),
    ];

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      wpTimers.forEach(clearTimeout);
    };
  }, [reducedMotion, skipped]);

  const handleSkip = () => {
    setSkipped(true);
    setStage(3);
    setActiveWaypoint(4);
    const el = document.getElementById('role-selection-grid');
    el?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section className="relative bg-[#06211A] text-white overflow-hidden">
      {/* Coherent Indian Urban Street Environment Backdrop */}
      <div className="relative max-w-[1380px] mx-auto px-4 sm:px-6 pt-8 pb-12 lg:pt-12 lg:pb-16">
        {/* Accessibility & Intro Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="text-xs font-medium text-emerald-200/90">
            Civic Grievance Intelligence · Indian Municipal Operations
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReducedMotion((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-100 bg-white/10 hover:bg-white/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {reducedMotion ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  Enable Motion
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  Reduced Motion
                </>
              )}
            </button>
            {!skipped && stage < 3 && (
              <button
                type="button"
                onClick={handleSkip}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Skip Intro
              </button>
            )}
          </div>
        </div>

        {/* Continuous Connected Cityscape Canvas + Animated Traveler */}
        <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-[#0B3B2E]">
          {/* Urban backdrop photography with controlled forest-green atmospheric scrim */}
          <div className="relative h-[300px] sm:h-[360px] lg:h-[400px] w-full">
            <img
              src={heroCityscapeImg}
              alt="Connected Indian urban streetscape"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06211A] via-[#06211A]/65 to-[#06211A]/40" />

            {/* Text Reveal Overlay */}
            <div className="absolute inset-x-0 top-6 sm:top-10 px-6 sm:px-10 max-w-3xl">
              <div className="space-y-2">
                <p
                  className={`text-lg sm:text-2xl font-display font-medium text-emerald-200 transition-all duration-500 ${
                    stage >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  100s of Complaints.
                </p>
                <p
                  className={`text-xl sm:text-3xl font-display font-semibold text-white transition-all duration-500 ${
                    stage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  One Platform.
                </p>
              </div>

              <div
                className={`mt-4 transition-all duration-700 ${
                  stage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                }`}
              >
                <h1 className="text-3xl sm:text-5xl font-display font-bold tracking-tight text-white">
                  CIVICSENSE AI
                </h1>
                <p className="text-sm sm:text-lg text-emerald-100/90 mt-2 max-w-xl">
                  Transforming Civic Problems into Collective Action.
                </p>
              </div>

              {stage >= 3 && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    {primaryCtaLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onExploreAction}
                    className="px-4 py-2.5 text-sm font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {secondaryCtaLabel}
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Civic Street Strip & Animated Indian Traveler */}
            <div className="absolute inset-x-0 bottom-0 h-28 sm:h-32 pointer-events-none">
              {/* Roadway + Sidewalk SVG Band */}
              <svg
                viewBox="0 0 1200 130"
                preserveAspectRatio="none"
                className="w-full h-full"
                aria-hidden="true"
              >
                {/* Footpath */}
                <rect x="0" y="68" width="1200" height="22" fill="#17493B" />
                <line x1="0" y1="68" x2="1200" y2="68" stroke="#34D399" strokeOpacity="0.25" strokeWidth="1.5" />
                {/* Asphalt Road */}
                <rect x="0" y="90" width="1200" height="40" fill="#0A2820" />
                <line
                  x1="0"
                  y1="110"
                  x2="1200"
                  y2="110"
                  stroke="#E5E7EB"
                  strokeOpacity="0.3"
                  strokeDasharray="18 14"
                  strokeWidth="2"
                />
              </svg>

              {/* 5 Street Issue Markers along the Avenue */}
              {CIVIC_WAYPOINTS.map((wp, idx) => {
                const isRevealed = idx <= activeWaypoint || stage >= 3;
                const isCurrent = idx === activeWaypoint;
                return (
                  <div
                    key={wp.id}
                    style={{ left: `${wp.leftPct}%` }}
                    className={`absolute bottom-9 -translate-x-1/2 flex flex-col items-center transition-all duration-500 ${
                      isRevealed ? 'opacity-100 scale-100' : 'opacity-25 scale-90'
                    }`}
                  >
                    <div
                      className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium border whitespace-nowrap mb-1.5 transition-colors ${
                        isCurrent
                          ? 'bg-orange-600 text-white border-orange-400 shadow-lg'
                          : isRevealed
                          ? 'bg-[#0B3B2E]/95 text-emerald-100 border-emerald-500/40'
                          : 'bg-black/40 text-neutral-400 border-white/10'
                      }`}
                    >
                      {wp.label}
                      {stage >= 3 && (
                        <span className="hidden md:inline text-emerald-300"> · {wp.dept}</span>
                      )}
                    </div>
                    {/* Street Issue Vector Marker */}
                    <div
                      className={`w-3 h-3 rounded-full border-2 border-white ${
                        wp.priority === 'Critical' ? 'bg-orange-500' : 'bg-emerald-400'
                      }`}
                    />
                  </div>
                );
              })}

              {/* Contemporary Indian Traveler Character (Non-stereotyped Commuter with Satchel & Phone) */}
              <div
                className={`absolute bottom-5 left-0 w-16 h-20 ${
                  reducedMotion || skipped ? 'translate-x-[76vw]' : 'animate-traveler-walk'
                }`}
                style={
                  reducedMotion || skipped
                    ? { transform: 'translateX(84%)' }
                    : undefined
                }
              >
                <svg
                  viewBox="0 0 64 80"
                  className={`w-full h-full ${reducedMotion || skipped ? '' : 'animate-gentle-bob'}`}
                  aria-label="Indian citizen commuter noticing civic issues"
                >
                  {/* Soft ground shadow */}
                  <ellipse cx="32" cy="75" rx="14" ry="3.5" fill="#000" fillOpacity="0.35" />
                  {/* Legs */}
                  <path d="M27 48 L24 72" stroke="#1E293B" strokeWidth="5.5" strokeLinecap="round" />
                  <path d="M35 48 L40 72" stroke="#334155" strokeWidth="5.5" strokeLinecap="round" />
                  {/* Kurta / Casual Jacket */}
                  <rect x="22" y="26" width="18" height="24" rx="5" fill="#10B981" />
                  {/* Crossbody Satchel */}
                  <path d="M23 27 L39 46" stroke="#06211A" strokeWidth="2.5" />
                  <rect x="19" y="38" width="9" height="10" rx="2" fill="#D97706" />
                  {/* Head */}
                  <circle cx="31" cy="17" r="7.5" fill="#A1623B" />
                  {/* Hair */}
                  <path d="M24 16 C24 9, 38 9, 38 16 C35 13, 27 13, 24 16 Z" fill="#1F2937" />
                  {/* Arm holding smartphone logging civic issue */}
                  <path d="M38 30 L47 36 L49 32" stroke="#A1623B" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <rect x="47" y="26" width="5" height="8" rx="1" fill="#F8FAFC" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
