import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Halt implements IAbility {
    private static instance: Halt;

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
        this.name = "Halt";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `halt
Halt allows the bandit to cut the straps off of a saddled horse sending
the rider to the ground.`;

        if (Halt.instance === undefined) {
            Halt.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Halt {
        if (!Halt.instance) {
            Halt.instance = new Halt();
        }
        return Halt.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Halt.GetInstance() as T;
    }
}

export default Halt;