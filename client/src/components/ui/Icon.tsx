import type { CSSProperties } from "react";
import {
  LayoutGrid,
  Package,
  Layers,
  Users,
  FileText,
  Repeat2,
  CreditCard,
  Tag,
  ChartNoAxesCombined,
  Search,
  Plus,
  ArrowRight,
  ChevronRight,
  Check,
  X,
  LogOut,
  SlidersHorizontal,
  CalendarDays,
  ShieldCheck,
  Pencil,
  Eye,
  Info,
  Menu,
  Mail,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
const icons = {
  grid: LayoutGrid,
  box: Package,
  layers: Layers,
  users: Users,
  file: FileText,
  repeat: Repeat2,
  credit: CreditCard,
  tag: Tag,
  chart: ChartNoAxesCombined,
  search: Search,
  plus: Plus,
  arrow: ArrowRight,
  chevron: ChevronRight,
  check: Check,
  close: X,
  logout: LogOut,
  settings: SlidersHorizontal,
  calendar: CalendarDays,
  shield: ShieldCheck,
  edit: Pencil,
  eye: Eye,
  info: Info,
  menu: Menu,
  mail: Mail,
  trend: TrendingUp,
  refresh: RefreshCw,
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const Component = icons[name as keyof typeof icons] ?? FileText;
  return (
    <Component
      size={size}
      strokeWidth={1.65}
      aria-hidden="true"
      style={style}
    />
  );
}
