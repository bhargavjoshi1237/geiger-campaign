"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen, Sparkles, ShoppingCart, UserPlus, HeartHandshake, RotateCcw, Calendar, Layers,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
  ScreenHeader,
  SearchInput,
  Field,
  Toolbar,
  SectionCard,
  EmptyState,
  Badge,
} from "@geiger/ui";

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
        <div className="py-4">
          <Field label="New workflow name" htmlFor="rc-name">
            <Input id="rc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={recipe.name} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(null)}>Cancel</Button>
          <Button onClick={() => onOpenChange(null)}>Create from recipe</Button>
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
    <MainScreenWrapper>
      <ScreenHeader
        title="Recipes"
        description="Pre-built automation templates you can launch in one click and tailor later."
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-44">
                {category === "All" ? "All categories" : category}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel className="text-text-secondary">Filter by category</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["All", ...CATEGORIES].map((c) => (
                <DropdownMenuItem key={c} onSelect={() => setCategory(c)} className={cn("cursor-pointer", category === c && "font-medium")}>
                  {c === "All" ? "All categories" : c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search recipes…" />
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const Icon = r.icon;
          return (
            <SectionCard key={r.id} className="transition-colors hover:border-border-strong" contentClassName="flex flex-1 flex-col">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-active text-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <Badge variant="neutral">{r.category}</Badge>
              </div>
              <h3 className="mt-4 font-medium text-foreground">{r.name}</h3>
              <p className="mt-1 flex-1 text-sm text-text-secondary">{r.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <BookOpen className="h-3.5 w-3.5" /> {r.steps} steps
                </span>
                <Button onClick={() => setActive(r)} size="sm">
                  <Sparkles className="h-3.5 w-3.5" /> Use recipe
                </Button>
              </div>
            </SectionCard>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No recipes found"
          description="No recipes match your filters."
          className="rounded-xl border border-border bg-surface-subtle"
        />
      )}

      <UseRecipeDialog recipe={active} onOpenChange={setActive} />
    </MainScreenWrapper>
  );
}

export default RecipesScreen;
