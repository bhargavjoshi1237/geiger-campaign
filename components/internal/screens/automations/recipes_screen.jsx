"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen, Sparkles, ShoppingCart, UserPlus, HeartHandshake, RotateCcw, Calendar, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SearchInput, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const RECIPES = [
  { id: 1, name: "Welcome new subscribers", description: "Greet new contacts and set expectations over 3 emails.", category: "Onboarding", steps: 5, icon: UserPlus },
  { id: 2, name: "Abandoned cart recovery", description: "Win back shoppers with a timed reminder + incentive.", category: "E-commerce", steps: 3, icon: ShoppingCart },
  { id: 3, name: "Post-purchase thank you", description: "Confirm the order, then cross-sell and ask for a review.", category: "E-commerce", steps: 4, icon: HeartHandshake },
  { id: 4, name: "Re-engage inactive contacts", description: "Reach quiet contacts and clean your list automatically.", category: "Retention", steps: 3, icon: RotateCcw },
  { id: 5, name: "Birthday reward", description: "Send a personalized coupon on each contact's birthday.", category: "Lifecycle", steps: 2, icon: Calendar },
  { id: 6, name: "Lead nurture drip", description: "Educate leads with a multi-week content sequence.", category: "Onboarding", steps: 6, icon: Layers },
];

const CATEGORIES = ["Onboarding", "E-commerce", "Retention", "Lifecycle"];

function UseRecipeDialog({ recipe, onOpenChange }) {
  const [name, setName] = useState("");
  if (!recipe) return null;
  return (
    <Dialog open={!!recipe} onOpenChange={(o) => { if (!o) { setName(""); onOpenChange(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use “{recipe.name}”</DialogTitle>
          <DialogDescription>We'll create a new workflow pre-built with {recipe.steps} steps. You can customize everything after.</DialogDescription>
        </DialogHeader>
        <DialogBody className="py-4">
          <Field label="New workflow name" htmlFor="rc-name">
            <Input id="rc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={recipe.name} className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(null)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={() => onOpenChange(null)} className="bg-white text-black hover:bg-[#e5e5e5]">Create from recipe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecipesScreen() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [active, setActive] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RECIPES.filter((r) => (category === "All" || r.category === category) && (!q || r.name.toLowerCase().includes(q)));
  }, [query, category]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Recipes"
        description="Pre-built automation templates you can launch in one click and tailor later."
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search recipes…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-44">
              {category === "All" ? "All categories" : category}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by category</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {["All", ...CATEGORIES].map((c) => (
              <DropdownMenuItem key={c} onSelect={() => setCategory(c)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", category === c && "text-white")}>
                {c === "All" ? "All categories" : c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.id} className="flex flex-col rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-colors hover:border-[#474747]">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#ededed]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="rounded border border-[#2a2a2a] bg-[#242424] px-1.5 py-0.5 text-xs text-[#a3a3a3]">{r.category}</span>
              </div>
              <h3 className="mt-4 font-medium text-[#ededed]">{r.name}</h3>
              <p className="mt-1 flex-1 text-sm text-[#737373]">{r.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-[#737373]">
                  <BookOpen className="h-3.5 w-3.5" /> {r.steps} steps
                </span>
                <Button onClick={() => setActive(r)} size="sm" className="bg-white text-black hover:bg-[#e5e5e5]">
                  <Sparkles className="h-3.5 w-3.5" /> Use recipe
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#1a1a1a] py-16 text-center text-sm text-[#737373]">No recipes match your filters.</div>
      )}

      <UseRecipeDialog recipe={active} onOpenChange={setActive} />
    </MainScreenWrapper>
  );
}

export default RecipesScreen;
