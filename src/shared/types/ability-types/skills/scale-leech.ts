import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ScaleLeech implements IAbility {
    private static instance: ScaleLeech;

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
        this.name = "ScaleLeech";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = ``;

        if (ScaleLeech.instance === undefined) {
            ScaleLeech.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): ScaleLeech {
        if (!ScaleLeech.instance) {
            ScaleLeech.instance = new ScaleLeech();
        }
        return ScaleLeech.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ScaleLeech.GetInstance() as T;
    }
}

export default ScaleLeech;