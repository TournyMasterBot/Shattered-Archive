import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Mimic implements IAbility {
    private static instance: Mimic;

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
        this.name = "Mimic";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `mimic
To disguise their face is not always enough. The swashbuckler is able to
mimic the voices of both his friends and foes alike. This unique ability
allows him to distract or misdirect any that would stand in his way.`;

        if (Mimic.instance === undefined) {
            Mimic.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Mimic {
        if (!Mimic.instance) {
            Mimic.instance = new Mimic();
        }
        return Mimic.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Mimic.GetInstance() as T;
    }
}

export default Mimic;