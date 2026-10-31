import {
  AlignLeft,
  Code2,
  Columns2,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  Share2,
  ShoppingBag,
  Type,
} from "lucide-react";
import { BLOCK_LIBRARY } from "@/lib/email/blocks";

// Icons for the block palette, canvas toolbar and saved-block lists.
export const BLOCK_ICONS = {
  heading: Type,
  text: AlignLeft,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  columns: Columns2,
  product: ShoppingBag,
  social: Share2,
  html: Code2,
};

export const PALETTE = BLOCK_LIBRARY.map((b) => ({ ...b, icon: BLOCK_ICONS[b.type] }));

export const BLOCK_TYPE_OPTIONS = BLOCK_LIBRARY.map((b) => ({ value: b.type, label: b.label }));

export const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

// Drag payload types for palette items and canvas blocks.
export const DND_NEW = "application/x-geiger-email-block-type";
export const DND_MOVE = "application/x-geiger-email-block-id";
export const DND_SAVED = "application/x-geiger-email-saved-block";
