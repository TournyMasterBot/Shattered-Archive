import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Survive implements IAbility {
    private static instance: Survive;

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
        this.name = "Survive";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.helpFile = ``;
        this.manualDescription = "Double damage below 20% health and taking damage";

        if (Survive.instance === undefined) {
            Survive.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Survive {
        if (!Survive.instance) {
            Survive.instance = new Survive();
        }
        return Survive.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Survive.GetInstance() as T;
    }
}

export default Survive;