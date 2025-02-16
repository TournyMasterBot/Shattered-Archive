import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class GroundFighting implements IAbility {
    private static instance: GroundFighting;

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
        this.name = "Ground Fighting";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `

`;

        if (GroundFighting.instance === undefined) {
            GroundFighting.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): GroundFighting {
        if (!GroundFighting.instance) {
            GroundFighting.instance = new GroundFighting();
        }
        return GroundFighting.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return GroundFighting.GetInstance() as T;
    }
}

export default GroundFighting;