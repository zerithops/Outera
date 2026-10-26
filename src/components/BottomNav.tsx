import React from 'react';
import { Compass, Sparkles, Bookmark, User, Flame } from 'lucide-react';

export type NavTab = 'discover' | 'explore' | 'surprise' | 'saved' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  savedCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  savedCount,
}) => {
  const tabs = [
    { id: 'discover' as NavTab, label: 'Discover', icon: Flame },
    { id: 'explore' as NavTab, label: 'Explore', icon: Compass },
    { id: 'surprise' as NavTab, label: 'Surprise', icon: Sparkles, highlight: true },
    { id: 'saved' as NavTab, label: 'Saved', icon: Bookmark, badge: savedCount > 0 ? savedCount : null },
    { id: 'profile' as NavTab, label: 'Profile', icon: User },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#090a0c]/90 backdrop-blur-lg border-t border-white/[0.08] pb-safe"
      aria-label="Bottom Navigation"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 h-16 items-center px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className="relative flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] group focus-visible:outline-none"
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150 ${
                  tab.highlight && !isActive
                    ? 'text-[#ccff00]'
                    : isActive
                    ? 'text-[#ccff00]'
                    : 'text-zinc-400 group-hover:text-zinc-200'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'scale-110 stroke-[2.2]' : 'scale-100 stroke-[1.8]'
                  }`}
                />

                {/* Saved count badge indicator */}
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 text-[10px] font-bold text-black bg-[#ccff00] rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                    {tab.badge}
                  </span>
                )}
              </div>

              <span
                className={`text-[11px] font-medium tracking-tight mt-0.5 transition-colors ${
                  isActive ? 'text-[#ccff00] font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </span>

              {/* Tiny active dot */}
              {isActive && (
                <span
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-[#ccff00]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
