import React from 'react';
import {
  Anchor,
  Beer,
  Castle,
  Church,
  CloudRain,
  Coins,
  Compass,
  Crown,
  Eye,
  Flame,
  Gem,
  Ghost,
  Map,
  Moon,
  Mountain,
  Music,
  ScrollText,
  Shield,
  Skull,
  Snowflake,
  Sun,
  Swords,
  Tent,
  Trees,
  Wand2,
  Waves,
  Zap,
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
    case 'shield':
      return <Shield className={className} />;
    case 'skull':
      return <Skull className={className} />;
    case 'ghost':
      return <Ghost className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'map':
      return <Map className={className} />;
    case 'trees':
      return <Trees className={className} />;
    case 'mountain':
      return <Mountain className={className} />;
    case 'waves':
      return <Waves className={className} />;
    case 'cloudRain':
      return <CloudRain className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'snowflake':
      return <Snowflake className={className} />;
    case 'wand':
      return <Wand2 className={className} />;
    case 'zap':
      return <Zap className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'castle':
      return <Castle className={className} />;
    case 'church':
      return <Church className={className} />;
    case 'gem':
      return <Gem className={className} />;
    case 'coins':
      return <Coins className={className} />;
    case 'anchor':
      return <Anchor className={className} />;
    case 'tent':
      return <Tent className={className} />;
    case 'moon':
      return <Moon className={className} />;
    case 'sun':
      return <Sun className={className} />;
    case 'scroll':
      return <ScrollText className={className} />;
    case 'eye':
      return <Eye className={className} />;
    case 'music':
    default:
      return <Music className={className} />;
  }
};

export const FOLDER_ICON_OPTIONS: { value: FolderIconName; label: string }[] = [
  { value: 'beer', label: 'Taberna' },
  { value: 'sword', label: 'Combate' },
  { value: 'shield', label: 'Guardia' },
  { value: 'skull', label: 'Mazmorra' },
  { value: 'ghost', label: 'Espectro' },
  { value: 'compass', label: 'Viaje' },
  { value: 'map', label: 'Mapa' },
  { value: 'trees', label: 'Bosque' },
  { value: 'mountain', label: 'Montaña' },
  { value: 'waves', label: 'Mar' },
  { value: 'cloudRain', label: 'Tormenta' },
  { value: 'flame', label: 'Fuego' },
  { value: 'snowflake', label: 'Hielo' },
  { value: 'wand', label: 'Magia' },
  { value: 'zap', label: 'Tensión' },
  { value: 'crown', label: 'Realeza' },
  { value: 'castle', label: 'Castillo' },
  { value: 'church', label: 'Templo' },
  { value: 'gem', label: 'Tesoro' },
  { value: 'coins', label: 'Mercado' },
  { value: 'anchor', label: 'Puerto' },
  { value: 'tent', label: 'Campamento' },
  { value: 'moon', label: 'Noche' },
  { value: 'sun', label: 'Día' },
  { value: 'scroll', label: 'Historia' },
  { value: 'eye', label: 'Misterio' },
  { value: 'music', label: 'General' },
];
