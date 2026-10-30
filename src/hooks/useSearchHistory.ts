import { useEffect, useRef, useState } from 'react';
import { recordSearchToSupabase, fetchRecentSearches } from '../services/supabase';

/**
 * useSearchHistory Hook
 * Automatically records searches into the 'search_history' Supabase table
 * whenever the user types in the search bar within ExploreView (debounced).
 */
export function useSearchHistory(
  searchQuery: string,
  locationContext?: string,
  resultCount?: number,
  debounceMs = 700
) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const lastRecordedQuery = useRef<string>('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial recent searches from Supabase
  useEffect(() => {
    let isMounted = true;
    fetchRecentSearches(6).then((searches) => {
      if (isMounted && searches.length > 0) {
        setRecentSearches(searches);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Debounced recording on search bar keystrokes
  useEffect(() => {
    const trimmed = searchQuery.trim();

    // Skip empty or trivial searches, or duplicate subsequent triggers for same query
    if (!trimmed || trimmed.length < 2 || trimmed === lastRecordedQuery.current) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      lastRecordedQuery.current = trimmed;
      const success = await recordSearchToSupabase(trimmed, locationContext, resultCount);
      if (success) {
        setRecentSearches((prev) => [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 6));
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [searchQuery, locationContext, resultCount, debounceMs]);

  return {
    recentSearches,
  };
}
