import React from 'react';
import {
  Beer,
  Compass,
  Crown,
  Flame,
  Moon,
  Music,
  Skull,
  Swords,
} from 'lucide-react';
import { FolderIconName } from '../types/audio';

interface FolderIconProps {
  name: FolderIconName;
  className?: string;
}

export const FolderIcon: React.FC<FolderIconProps> = ({ name, className = 'w-4 h-4' }) => {
  switch (name) {
    case 'beer':
      return <Beer className={className} />;
    case 'sword':
      return <Swords className={className} />;
    case 'skull':
      return <Skull className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'moon':
      return <Moon className={className} />;
    case 'music':
    default:
      return <Music className={className} />;
  }
};

export const FOLDER_ICON_OPTIONS: { value: FolderIconName; label: string }[] = [
  { value: 'beer', label: 'Taberna' },
  { value: 'sword', label: 'Combate' },
  { value: 'skull', label: 'Mazmorra' },
  { value: 'compass', label: 'Viaje' },
  { value: 'flame', label: 'Fuego' },
  { value: 'crown', label: 'Realeza' },
  { value: 'moon', label: 'Noche' },
  { value: 'music', label: 'General' },
];
