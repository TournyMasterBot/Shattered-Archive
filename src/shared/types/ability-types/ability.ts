import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";
import AbilityGroupType from "./ability-group-type";

interface IAbility {
    name: string;
    manualDescription?: string;
    helpFile?: string;
    duration?: number;
    effects?: SkillSpellEffects;
    group?: string;
    alternateKeyword?: string;
    recommendedHelpFileChanges?: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    abilityBuffVariable?: string;
    abilityBuffCommand?: string;

    Get<T>(): T;
}

export default IAbility;