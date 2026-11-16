import React from 'react';
import {
  Anchor,
  Award,
  Axe,
  Beer,
  Bell,
  Biohazard,
  Bird,
  Bone,
  BookOpen,
  BowArrow,
  Bug,
  Caravan,
  Castle,
  Cat,
  Church,
  CloudLightning,
  CloudRain,
  Coins,
  Compass,
  Crown,
  Dices,
  Dog,
  Drama,
  Droplets,
  Drum,
  Eye,
  Feather,
  Fish,
  Flame,
  Flag,
  Flower2,
  Footprints,
  Gem,
  Ghost,
  Hammer,
  Heart,
  Home,
  Hourglass,
  KeyRound,
  Landmark,
  Leaf,
  Lock,
  Map,
  Moon,
  Mountain,
  MountainSnow,
  Music,
  Palmtree,
  Rat,
  Sailboat,
  Scale,
  ScrollText,
  Shield,
  ShieldAlert,
  Ship,
  Signpost,
  Skull,
  Snowflake,
  Sprout,
  Sun,
  Sword,
  Swords,
  Target,
  Tent,
  Tornado,
  TowerControl,
  TreeDeciduous,
  TreePine,
  Trees,
  Utensils,
  VenetianMask,
  Wand2,
  Waves,
  Wind,
  Wine,
  Warehouse,
  Worm,
  Zap,
} from 'lucide-react';
import { FolderIconName } from '../types/audio';

interface FolderIconProps {
  name: FolderIconName;
  className?: string;
}

export type FolderIconCategory =
  | 'entornos'
  | 'lugares'
  | 'monstruos'
  | 'combate'
  | 'magia'
  | 'aventura';

export interface FolderIconOption {
  value: FolderIconName;
  label: string;
  category: FolderIconCategory;
  keywords: string;
}

export const FOLDER_ICON_CATEGORIES: { id: FolderIconCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'entornos', label: 'Entornos' },
  { id: 'lugares', label: 'Lugares' },
  { id: 'monstruos', label: 'Monstruos' },
  { id: 'combate', label: 'Combate' },
  { id: 'magia', label: 'Magia y Botín' },
  { id: 'aventura', label: 'Aventura' },
];

export const FolderIcon: React.FC<FolderIconProps> = ({ name, className = 'w-4 h-4' }) => {
  switch (name) {
    // Lugares y Arquitectura
    case 'beer':
      return <Beer className={className} />;
    case 'wine':
      return <Wine className={className} />;
    case 'utensils':
      return <Utensils className={className} />;
    case 'church':
      return <Church className={className} />;
    case 'castle':
      return <Castle className={className} />;
    case 'landmark':
      return <Landmark className={className} />;
    case 'tower':
      return <TowerControl className={className} />;
    case 'home':
      return <Home className={className} />;
    case 'tent':
      return <Tent className={className} />;
    case 'warehouse':
      return <Warehouse className={className} />;
    case 'anchor':
      return <Anchor className={className} />;

    // Entornos y Biomas
    case 'trees':
      return <Trees className={className} />;
    case 'treePine':
      return <TreePine className={className} />;
    case 'treeDeciduous':
      return <TreeDeciduous className={className} />;
    case 'leaf':
      return <Leaf className={className} />;
    case 'sprout':
      return <Sprout className={className} />;
    case 'flower':
      return <Flower2 className={className} />;
    case 'mountain':
      return <Mountain className={className} />;
    case 'mountainSnow':
      return <MountainSnow className={className} />;
    case 'palmtree':
      return <Palmtree className={className} />;
    case 'sun':
      return <Sun className={className} />;
    case 'wind':
      return <Wind className={className} />;
    case 'tornado':
      return <Tornado className={className} />;
    case 'cloudRain':
      return <CloudRain className={className} />;
    case 'cloudLightning':
      return <CloudLightning className={className} />;
    case 'snowflake':
      return <Snowflake className={className} />;
    case 'waves':
      return <Waves className={className} />;
    case 'droplets':
      return <Droplets className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'moon':
      return <Moon className={className} />;

    // Monstruos y Criaturas
    case 'skull':
      return <Skull className={className} />;
    case 'ghost':
      return <Ghost className={className} />;
    case 'bone':
      return <Bone className={className} />;
    case 'rat':
      return <Rat className={className} />;
    case 'bug':
      return <Bug className={className} />;
    case 'worm':
      return <Worm className={className} />;
    case 'biohazard':
      return <Biohazard className={className} />;
    case 'bird':
      return <Bird className={className} />;
    case 'dog':
      return <Dog className={className} />;
    case 'cat':
      return <Cat className={className} />;
    case 'fish':
      return <Fish className={className} />;
    case 'eye':
      return <Eye className={className} />;

    // Combate y Armas
    case 'sword':
      return <Swords className={className} />;
    case 'swordSingle':
      return <Sword className={className} />;
    case 'axe':
      return <Axe className={className} />;
    case 'hammer':
      return <Hammer className={className} />;
    case 'bow':
      return <BowArrow className={className} />;
    case 'shield':
      return <Shield className={className} />;
    case 'shieldAlert':
      return <ShieldAlert className={className} />;
    case 'target':
      return <Target className={className} />;
    case 'zap':
      return <Zap className={className} />;

    // Magia, Reliquias y Tesoro
    case 'wand':
      return <Wand2 className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'scroll':
      return <ScrollText className={className} />;
    case 'feather':
      return <Feather className={className} />;
    case 'gem':
      return <Gem className={className} />;
    case 'coins':
      return <Coins className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'key':
      return <KeyRound className={className} />;
    case 'lock':
      return <Lock className={className} />;
    case 'hourglass':
      return <Hourglass className={className} />;
    case 'bell':
      return <Bell className={className} />;
    case 'scale':
      return <Scale className={className} />;

    // Aventura, Navegación y Rol
    case 'compass':
      return <Compass className={className} />;
    case 'map':
      return <Map className={className} />;
    case 'signpost':
      return <Signpost className={className} />;
    case 'footprints':
      return <Footprints className={className} />;
    case 'ship':
      return <Ship className={className} />;
    case 'sailboat':
      return <Sailboat className={className} />;
    case 'caravan':
      return <Caravan className={className} />;
    case 'dices':
      return <Dices className={className} />;
    case 'mask':
      return <VenetianMask className={className} />;
    case 'drama':
      return <Drama className={className} />;
    case 'flag':
      return <Flag className={className} />;
    case 'award':
      return <Award className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'drum':
      return <Drum className={className} />;
    case 'music':
    default:
      return <Music className={className} />;
  }
};

export const FOLDER_ICON_OPTIONS: FolderIconOption[] = [
  // Entornos y Biomas
  { value: 'trees', label: 'Bosque', category: 'entornos', keywords: 'bosque arbol arboleda naturaleza' },
  { value: 'treePine', label: 'Pinar', category: 'entornos', keywords: 'pino taiga bosque frio nieve' },
  { value: 'treeDeciduous', label: 'Roble', category: 'entornos', keywords: 'arbol roble claro druida' },
  { value: 'leaf', label: 'Selva', category: 'entornos', keywords: 'selva jungla hoja elfos' },
  { value: 'sprout', label: 'Pradera', category: 'entornos', keywords: 'pradera campo jardin brote' },
  { value: 'flower', label: 'Feérico', category: 'entornos', keywords: 'flor feywild primavera feerico' },
  { value: 'mountain', label: 'Montaña', category: 'entornos', keywords: 'montaña sierra colina cueva' },
  { value: 'mountainSnow', label: 'Cumbres', category: 'entornos', keywords: 'cumbre picos nieve montaña' },
  { value: 'palmtree', label: 'Oasis', category: 'entornos', keywords: 'desierto oasis palmera dunas isla' },
  { value: 'sun', label: 'Desierto', category: 'entornos', keywords: 'desierto sol arena calor dunas dia' },
  { value: 'wind', label: 'Dunas', category: 'entornos', keywords: 'dunas viento desierto tormenta arena' },
  { value: 'cloudRain', label: 'Lluvia', category: 'entornos', keywords: 'lluvia tormenta clima agua' },
  { value: 'cloudLightning', label: 'Tempestad', category: 'entornos', keywords: 'tempestad rayo relampago tormenta' },
  { value: 'tornado', label: 'Ciclón', category: 'entornos', keywords: 'tornado huracan caos viento' },
  { value: 'snowflake', label: 'Hielo', category: 'entornos', keywords: 'hielo nieve artico glaciar frio' },
  { value: 'waves', label: 'Océano', category: 'entornos', keywords: 'mar oceano olas costa agua' },
  { value: 'droplets', label: 'Pantano', category: 'entornos', keywords: 'pantano cienaga cueva humedad' },
  { value: 'flame', label: 'Volcán', category: 'entornos', keywords: 'fuego volcan lava hoguera dragon' },
  { value: 'moon', label: 'Noche', category: 'entornos', keywords: 'noche luna oscuridad campamento' },

  // Lugares y Arquitectura
  { value: 'beer', label: 'Taberna', category: 'lugares', keywords: 'taberna posada cerveza bar' },
  { value: 'utensils', label: 'Mesón', category: 'lugares', keywords: 'meson posada comida banquete' },
  { value: 'wine', label: 'Banquete', category: 'lugares', keywords: 'vino nobleza corte fiesta' },
  { value: 'church', label: 'Iglesia', category: 'lugares', keywords: 'iglesia catedral templo capilla clerigo' },
  { value: 'landmark', label: 'Ruinas', category: 'lugares', keywords: 'ruinas templo panteon santuario' },
  { value: 'castle', label: 'Castillo', category: 'lugares', keywords: 'castillo fortaleza ciudadela reino' },
  { value: 'tower', label: 'Torre', category: 'lugares', keywords: 'torre mago atalaya faro' },
  { value: 'home', label: 'Aldea', category: 'lugares', keywords: 'aldea pueblo villa ciudad casa' },
  { value: 'tent', label: 'Campamento', category: 'lugares', keywords: 'campamento tienda descanso viaje' },
  { value: 'warehouse', label: 'Gremio', category: 'lugares', keywords: 'gremio herreria cuartel almacen' },
  { value: 'anchor', label: 'Puerto', category: 'lugares', keywords: 'puerto muelle barco pirata' },

  // Monstruos y Criaturas
  { value: 'skull', label: 'Mazmorra', category: 'monstruos', keywords: 'monstruo calavera no muertos mazmorra liche' },
  { value: 'ghost', label: 'Espectro', category: 'monstruos', keywords: 'fantasma espectro terror espiritu monstruo' },
  { value: 'bone', label: 'Esqueleto', category: 'monstruos', keywords: 'esqueleto hueso catacumba tumba' },
  { value: 'rat', label: 'Alimañas', category: 'monstruos', keywords: 'rata plaga alcantarilla monstruo' },
  { value: 'bug', label: 'Insectos', category: 'monstruos', keywords: 'insecto araña enjambre suboscuridad' },
  { value: 'worm', label: 'Sierpe', category: 'monstruos', keywords: 'gusano sierpe monstruo subterraneo' },
  { value: 'biohazard', label: 'Plaga', category: 'monstruos', keywords: 'veneno plaga monstruo corrupcion' },
  { value: 'bird', label: 'Cuervo', category: 'monstruos', keywords: 'cuervo ave aguila grifo bestia' },
  { value: 'dog', label: 'Lobo', category: 'monstruos', keywords: 'lobo huargo sabueso bestia manada' },
  { value: 'cat', label: 'Pantera', category: 'monstruos', keywords: 'felino pantera tigre bestia sigilo' },
  { value: 'fish', label: 'Kraken', category: 'monstruos', keywords: 'kraken monstruo marino pez abismo' },
  { value: 'eye', label: 'Observador', category: 'monstruos', keywords: 'ojo contemplador beholder misterio' },

  // Combate y Armas
  { value: 'sword', label: 'Combate', category: 'combate', keywords: 'espadas combate pelea batalla' },
  { value: 'swordSingle', label: 'Duelo', category: 'combate', keywords: 'espada duelo guerrero caballero' },
  { value: 'axe', label: 'Bárbaro', category: 'combate', keywords: 'hacha barbaro guerrero enano' },
  { value: 'hammer', label: 'Forja', category: 'combate', keywords: 'martillo paladin forja herrero' },
  { value: 'bow', label: 'Arquero', category: 'combate', keywords: 'arco flecha explorador ranger caza' },
  { value: 'shield', label: 'Guardia', category: 'combate', keywords: 'escudo defensa guardia bastion' },
  { value: 'shieldAlert', label: 'Emboscada', category: 'combate', keywords: 'emboscada peligro trampa ataque' },
  { value: 'target', label: 'Cacería', category: 'combate', keywords: 'blanco objetivo caceria asesino' },
  { value: 'zap', label: 'Jefe final', category: 'combate', keywords: 'jefe boss tension rayo epico' },

  // Magia, Reliquias y Botín
  { value: 'wand', label: 'Magia', category: 'magia', keywords: 'magia varita hechizo arcano' },
  { value: 'book', label: 'Grimorio', category: 'magia', keywords: 'grimorio libro tomo biblioteca saber' },
  { value: 'scroll', label: 'Misión', category: 'magia', keywords: 'pergamino mision historia contrato' },
  { value: 'feather', label: 'Crónica', category: 'magia', keywords: 'pluma escriba historia diario' },
  { value: 'gem', label: 'Tesoro', category: 'magia', keywords: 'gema joya tesoro cristal botin' },
  { value: 'coins', label: 'Mercado', category: 'magia', keywords: 'monedas oro mercado bazar tienda' },
  { value: 'crown', label: 'Realeza', category: 'magia', keywords: 'corona rey reina trono corte' },
  { value: 'key', label: 'Llave', category: 'magia', keywords: 'llave secreto puerta cofre' },
  { value: 'lock', label: 'Prisión', category: 'magia', keywords: 'candado prision calabozo celda' },
  { value: 'hourglass', label: 'Ritual', category: 'magia', keywords: 'reloj arena tiempo ritual trampa' },
  { value: 'bell', label: 'Campana', category: 'magia', keywords: 'campana iglesia alarma funeral' },
  { value: 'scale', label: 'Juicio', category: 'magia', keywords: 'balanza justicia ley pacto' },

  // Aventura, Navegación y Rol
  { value: 'compass', label: 'Viaje', category: 'aventura', keywords: 'brujula viaje ruta exploracion' },
  { value: 'map', label: 'Mapa', category: 'aventura', keywords: 'mapa mundo region camino' },
  { value: 'signpost', label: 'Cruce', category: 'aventura', keywords: 'cartel cruce sendero encrucijada' },
  { value: 'footprints', label: 'Sigilo', category: 'aventura', keywords: 'huellas sigilo rastreo ladron' },
  { value: 'ship', label: 'Navío', category: 'aventura', keywords: 'barco galeon pirata navio' },
  { value: 'sailboat', label: 'Travesía', category: 'aventura', keywords: 'velero rio lago travesia' },
  { value: 'caravan', label: 'Caravana', category: 'aventura', keywords: 'caravana carro mercader camino' },
  { value: 'dices', label: 'Sesión', category: 'aventura', keywords: 'dados rol d20 partida azar' },
  { value: 'mask', label: 'Intriga', category: 'aventura', keywords: 'mascara intriga baile misterio' },
  { value: 'drama', label: 'Teatro', category: 'aventura', keywords: 'teatro drama bardo escena' },
  { value: 'flag', label: 'Guerra', category: 'aventura', keywords: 'bandera estandarte ejercito asedio' },
  { value: 'award', label: 'Victoria', category: 'aventura', keywords: 'gloria victoria torneo honor' },
  { value: 'heart', label: 'Calma', category: 'aventura', keywords: 'corazon romance descanso calma' },
  { value: 'drum', label: 'Marcha', category: 'aventura', keywords: 'tambor marcha guerra tribu' },
  { value: 'music', label: 'Bardo', category: 'aventura', keywords: 'musica bardo general melodia' },
];
