import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CauseFatality implements IAbility {
    private static instance: CauseFatality;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cause Fatality";
        this.helpFile = `
help harmful
cause fatality  the most powerful harmful spell, possible instant death
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CauseFatality.instance === undefined) {
            CauseFatality.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CauseFatality {
        if (!CauseFatality.instance) {
            CauseFatality.instance = new CauseFatality();
        }
        return CauseFatality.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CauseFatality.GetInstance() as T;
    }
}

export default CauseFatality;