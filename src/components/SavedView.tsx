import React, { useState } from 'react';
import { Bookmark, Sparkles, FolderPlus, ArrowRight, Trash2 } from 'lucide-react';
import { Place, SavedCollection } from '../types/outera';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { PlaceCard } from './PlaceCard';
import { saveCollection } from '../services/storage';

interface SavedViewProps {
  savedPlaces: PlaceWithDistance[];
  collections: SavedCollection[];
  onToggleSave: (e: React.MouseEvent, id: string) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onGoToDiscover: () => void;
  onRefreshCollections: () => void;
  isAuthenticated?: boolean;
  onOpenAuthModal?: () => void;
}

export const SavedView: React.FC<SavedViewProps> = ({
  savedPlaces,
  collections,
  onToggleSave,
  onSelectPlace,
  onGoToDiscover,
  onRefreshCollections,
  isAuthenticated = false,
  onOpenAuthModal,
}) => {
  const [activeCollectionId, setActiveCollectionId] = useState<string | 'all'>('all');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="w-full px-4 sm:px-6 py-16 max-w-md mx-auto text-center space-y-4">
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.06] space-y-4">
          <Bookmark className="w-10 h-10 text-[#ccff00] mx-auto" />
          <h2 className="text-xl font-black text-white tracking-tight">Your Scout Vault</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Create an account to save places, build custom outing lists, and sync your discoveries across devices.
          </p>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="h-11 px-6 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 hover:bg-[#d8ff33] transition-all"
          >
            <span>Join OUTERA</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const displayedPlaces =
    activeCollectionId === 'all'
      ? savedPlaces
      : savedPlaces.filter((p) => {
          const col = collections.find((c) => c.id === activeCollectionId);
          return col?.placeIds.includes(p.id);
        });

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;

    const newCol: SavedCollection = {
      id: `col-${Date.now()}`,
      name: newCollectionName.trim(),
      description: 'Custom curated collection',
      placeIds: savedPlaces.map((p) => p.id),
      createdAt: Date.now(),
    };

    saveCollection(newCol);
    onRefreshCollections();
    setNewCollectionName('');
    setIsCreating(false);
    setActiveCollectionId(newCol.id);
  };

  return (
    <div className="w-full px-4 sm:px-6 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ccff00]">
            Your Vault
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-0.5">
            Saved Places & Lists
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="h-9 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 transition-all"
        >
          <FolderPlus className="w-4 h-4 text-[#ccff00]" />
          <span>New List</span>
        </button>
      </div>

      {/* New Collection Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateCollection}
          className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3 animate-in fade-in duration-150"
        >
          <p className="text-xs font-bold text-white">Create a Custom Outing List</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="e.g. Rainy Day Rooftops, Late Night Runs..."
              className="flex-1 h-10 px-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
              autoFocus
            />
            <button
              type="submit"
              className="h-10 px-4 rounded-xl bg-[#ccff00] text-black font-bold text-xs"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="h-10 px-3 rounded-xl bg-white/[0.06] text-zinc-400 hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Collections Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setActiveCollectionId('all')}
          className={`shrink-0 h-9 px-3.5 rounded-xl text-xs font-semibold transition-all border ${
            activeCollectionId === 'all'
              ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          All Saved ({savedPlaces.length})
        </button>

        {collections.map((col) => {
          const isSelected = activeCollectionId === col.id;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setActiveCollectionId(col.id)}
              className={`shrink-0 h-9 px-3.5 rounded-xl text-xs font-semibold transition-all border ${
                isSelected
                  ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                  : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
              }`}
            >
              <span>{col.name}</span>
            </button>
          );
        })}
      </div>

      {/* Saved Places Grid */}
      {displayedPlaces.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {displayedPlaces.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              isSaved={true}
              onToggleSave={onToggleSave}
              onSelect={onSelectPlace}
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="py-16 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-sm mx-auto my-6">
          <Bookmark className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-white">Your vault is looking clean</h2>
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
            Whenever you spot a hangout, bouldering wall or vinyl nook you want to remember, tap the bookmark icon.
          </p>
          <button
            type="button"
            onClick={onGoToDiscover}
            className="mt-5 px-5 py-2.5 rounded-xl bg-[#ccff00] text-black font-bold text-xs inline-flex items-center gap-2 hover:bg-[#d4ff1a] transition-all"
          >
            <span>Explore Spots Worth Going To</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
