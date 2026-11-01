import React from 'react';
import { LocationHierarchyModal } from './LocationHierarchyModal';
import { UserLocation } from '../types/outera';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: UserLocation;
  onSelectLocation: (loc: UserLocation) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
}) => {
  return (
    <LocationHierarchyModal
      isOpen={isOpen}
      onClose={onClose}
      currentLocation={currentLocation}
      onSelectLocation={onSelectLocation}
    />
  );
};
