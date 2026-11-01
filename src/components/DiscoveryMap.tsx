import React from 'react';
import { OuteraMap } from './OuteraMap';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { UserLocation } from '../types/outera';

interface DiscoveryMapProps {
  places: PlaceWithDistance[];
  currentLocation: UserLocation;
  selectedLayer: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events';
  onChangeLayer: (
    layer: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events'
  ) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onRequestGPS?: () => void;
  isDetectingGPS?: boolean;
}

export const DiscoveryMap: React.FC<DiscoveryMapProps> = (props) => {
  return <OuteraMap {...props} />;
};
