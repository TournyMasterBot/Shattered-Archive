import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Jawbind implements IAbility {
    private static instance: Jawbind;

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
        this.name = "Jawbind";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = ``;

        if (Jawbind.instance === undefined) {
            Jawbind.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Jawbind {
        if (!Jawbind.instance) {
            Jawbind.instance = new Jawbind();
        }
        return Jawbind.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Jawbind.GetInstance() as T;
    }
}

export default Jawbind;