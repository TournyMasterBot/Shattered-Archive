import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Possession implements IAbility {
    private static instance: Possession;

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
        this.name = "Possession";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = "";

        if (Possession.instance === undefined) {
            Possession.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Possession {
        if (!Possession.instance) {
            Possession.instance = new Possession();
        }
        return Possession.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Possession.GetInstance() as T;
    }
}

export default Possession;