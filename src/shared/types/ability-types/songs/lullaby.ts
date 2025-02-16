import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Lullaby implements IAbility {
    private static instance: Lullaby;

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
        this.name = "Lullaby";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
Lullaby - A soft and gentle melody that enables the singer to put 
someone temporarily in a deep sleep.
`;

        if (Lullaby.instance === undefined) {
            Lullaby.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Lullaby {
        if (!Lullaby.instance) {
            Lullaby.instance = new Lullaby();
        }
        return Lullaby.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Lullaby.GetInstance() as T;
    }
}

export default Lullaby;