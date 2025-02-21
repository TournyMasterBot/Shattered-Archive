interface IDslItem {
    item_hash: string;
    sort_hash: string;
    display_hash: string;
    item_name: string;
    area_found: string;
    level: number;
    internal_type?: string;
    item_type?: string;
    slot_type?: string;
    weapon_type?: string;
    armor_type?: string;
    piercing_defense?: number;
    bash_defense?: number;
    slash_defense?: number;
    magic_defense?: number;
    extra_flags?: string;
    is_enchantable: boolean;
    average_damage?: number;
    damage_type?: string;
    damage_dice?: string;
    damage_min?: number;
    damage_max?: number;
    consumable_category?: string;
    spell_level?: number;
    spell_1?: string;
    spell_2?: string;
    spell_3?: string;
    is_equipment_list_visible: boolean;
    // Manually appended data:
    weight?: number;
    material?: string;
    size?: string;
    condition?: string;
  }

  export default IDslItem;