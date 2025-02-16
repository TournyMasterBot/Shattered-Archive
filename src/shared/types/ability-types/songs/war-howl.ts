import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class WarHowl implements IAbility {
    private static instance: WarHowl;

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
        this.name = "War Howl";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
War Howl - The tune resembles a howl as signified by its name, allowing
the skald to physically injure a single target as well as have a chance 
to also stun them.
`;

        if (WarHowl.instance === undefined) {
            WarHowl.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): WarHowl {
        if (!WarHowl.instance) {
            WarHowl.instance = new WarHowl();
        }
        return WarHowl.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return WarHowl.GetInstance() as T;
    }
}

export default WarHowl;