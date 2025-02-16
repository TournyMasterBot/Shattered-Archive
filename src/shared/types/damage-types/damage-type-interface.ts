import { DslDamageType } from  "@shared/types/damage-types/damage-type";
import { DslDamageCategoryType } from "@shared/types/damage-types/damage-category-type";
import { DslDamageResistanceType } from "@shared/types/damage-types/damage-resistance-type";

export interface IDamageType {
    id: string;
    name: string;
    type: DslDamageType;
    damageCategoryType: DslDamageCategoryType;
    resistanceCategories: DslDamageResistanceType[];
    Get<T>():T;
}