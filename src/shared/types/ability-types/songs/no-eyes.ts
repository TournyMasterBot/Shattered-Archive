import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class NoEyes implements IAbility {
    private static instance: NoEyes;

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
        this.name = "No Eyes";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
No Eyes - A strong and powerful song that has the ability to blind the 
bard's opponent for which there is no cure for a short duration of time.
`;
        this.manualDescription = "* Incurable blind for 3 ticks";

        if (NoEyes.instance === undefined) {
            NoEyes.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): NoEyes {
        if (!NoEyes.instance) {
            NoEyes.instance = new NoEyes();
        }
        return NoEyes.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return NoEyes.GetInstance() as T;
    }
}

export default NoEyes;