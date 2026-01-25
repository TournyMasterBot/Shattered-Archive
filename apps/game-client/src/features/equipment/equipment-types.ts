// apps/game-client/src/features/equipment/equipment-types.ts

export type EquipmentSlot = 'wielded' | 'secondary' | 'shield' | 'sheathed';

/** ALL eq slots (for full snapshot display) */
export type EqSlot =
  | 'used_as_light'
  | 'worn_on_finger'
  | 'worn_around_neck'
  | 'worn_on_torso'
  | 'worn_on_head'
  | 'worn_on_legs'
  | 'worn_on_feet'
  | 'worn_on_hands'
  | 'worn_on_arms'
  | 'worn_as_shield'
  | 'worn_about_body'
  | 'worn_about_waist'
  | 'worn_around_wrist'
  | 'wielded'
  | 'held'
  | 'floating_nearby'
  | 'secondary_weapon'
  | 'sheathed'
  | 'worn_as_quiver';

export type EquipmentSlotState = {
  slot: EquipmentSlot;
  text: string; // item display line
  updatedAt: number;
  /** true if this slot was set by optimistic delta and not yet confirmed by eq */
  dirty: boolean;
};

export type EquipmentState = {
  connectionId: string;
  slots: Record<EquipmentSlot, EquipmentSlotState | null>;
  lastEqAt?: number;
};

export type EquipmentSlotSnapshot = {
  slot: EqSlot;
  rawLine: string; // ansi stripped, trimmed, slot prefix removed
  updatedAt: number;
};

export type EquipmentSnapshot = {
  updatedAt: number;
  // MUST be partial because not every tag always appears
  slots: Partial<Record<EqSlot, EquipmentSlotSnapshot>>;
  allLines: string[];
};

export type EquipmentProfile = {
  connectionId: string;
  aliases: Record<string, string>;
  sets: any[];
  snapshot?: EquipmentSnapshot;
  activeSetId?: string;
};

export type HotbarDockMode = 'docked' | 'floating';

export type EquipmentPreferences = {
  connectionId: string;
  hotbarDockMode: HotbarDockMode;
};
