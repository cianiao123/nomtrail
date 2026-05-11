import { cn } from "@/lib/utils/cn";
import type { CSSProperties } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  Bus,
  CalendarDays,
  CalendarPlus,
  CheckCircle,
  CircleHelp,
  CirclePlus,
  CircleUserRound,
  CloudRain,
  Clock,
  Compass,
  CreditCard,
  Grid2X2,
  Edit,
  GripVertical,
  Heart,
  History,
  Home,
  Hotel,
  Landmark,
  Mountain,
  LoaderCircle,
  LocateFixed,
  Map,
  MapPin,
  MapPinOff,
  Maximize2,
  Minus,
  MoreHorizontal,
  NotebookPen,
  Plane,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Tent,
  Trash2,
  Utensils,
  User,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

interface IconProps {
  name: string;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
  weight?: number;
}

const icons: Record<string, LucideIcon> = {
  account_circle: CircleUserRound,
  add: Plus,
  add_circle: CirclePlus,
  apps: Grid2X2,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  attractions: Landmark,
  auto_awesome: Sparkles,
  bookmark: Bookmark,
  check_circle: CheckCircle,
  close: X,
  delete: Trash2,
  delete_sweep: Trash2,
  directions_bus: Bus,
  drag_indicator: GripVertical,
  edit: Edit,
  edit_calendar: CalendarPlus,
  edit_note: NotebookPen,
  error: AlertCircle,
  explore: Compass,
  favorite: Heart,
  favorite_border: Heart,
  flight: Plane,
  hiking: Tent,
  history: History,
  home: Home,
  hotel: Hotel,
  info: CircleHelp,
  landscape: Mountain,
  magic_button: WandSparkles,
  map: Map,
  map_off: MapPinOff,
  more_horiz: MoreHorizontal,
  my_location: LocateFixed,
  notifications: Bell,
  open_in_full: Maximize2,
  payments: CreditCard,
  person: User,
  place: MapPin,
  progress_activity: LoaderCircle,
  rainy: CloudRain,
  remove: Minus,
  restaurant: Utensils,
  schedule: Clock,
  search: Search,
  send: Send,
  settings: Settings,
  travel_explore: Compass,
  weekend: CalendarDays,
};

export function Icon({ name, className, style, filled = false, weight }: IconProps) {
  const Lucide = icons[name] ?? CircleHelp;
  const strokeWidth = weight !== undefined
    ? Math.max(1.25, Math.min(2.5, weight / 120))
    : 2;

  return (
    <Lucide
      className={cn("inline-block shrink-0 select-none", className)}
      style={{
        ...style,
        width: "1em",
        height: "1em",
      }}
      aria-hidden="true"
      focusable="false"
      fill={filled ? "currentColor" : "none"}
      strokeWidth={strokeWidth}
    />
  );
}
