export type AudioSourceType = 'audius' | 'youtube' | 'direct';

export type FolderIconName =
  | 'beer'
  | 'sword'
  | 'skull'
  | 'compass'
  | 'flame'
  | 'crown'
  | 'moon'
  | 'music';

export interface Track {
  id: string;
  title: string;
  artist: string;
  source: AudioSourceType;
  url: string;
  youtubeId?: string;
  duration?: number;
  artworkUrl?: string;
  addedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  icon: FolderIconName;
  trackIds: string[];
  createdAt: number;
}

export type SoundCategory = 'ambiente' | 'combate' | 'criaturas' | 'escena';

export interface SoundPad {
  id: string;
  name: string;
  category: SoundCategory;
  url: string;
  loop: boolean;
  volume: number;
  sourceLabel: string;
  isCustom?: boolean;
}

export type LoopMode = 'none' | 'folder' | 'track';

export interface CrossfadeStatus {
  active: boolean;
  progress: number;
  durationSec: number;
  fromTitle?: string;
  toTitle?: string;
}

export interface WikimediaSfxResult {
  id: string;
  title: string;
  url: string;
  duration?: number;
  mime: string;
  sourceLabel?: string;
}
