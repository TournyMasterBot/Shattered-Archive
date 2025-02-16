import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Breaking implements IAbility {
    private static instance: Breaking;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Breaking";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
`;

        if (Breaking.instance === undefined) {
            Breaking.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Breaking {
        if (!Breaking.instance) {
            Breaking.instance = new Breaking();
        }
        return Breaking.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Breaking.GetInstance() as T;
    }
}

export default Breaking;