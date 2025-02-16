import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class TailStrike implements IAbility {
    private static instance: TailStrike;

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
        this.name = "Tail Strike";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = ``;

        if (TailStrike.instance === undefined) {
            TailStrike.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): TailStrike {
        if (!TailStrike.instance) {
            TailStrike.instance = new TailStrike();
        }
        return TailStrike.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return TailStrike.GetInstance() as T;
    }
}

export default TailStrike;