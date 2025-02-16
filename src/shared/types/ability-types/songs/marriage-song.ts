import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class MarriageSong implements IAbility {
    private static instance: MarriageSong;

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
        this.name = "The Marriage Song";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
The Marriage Song - This unique bard song enables the bard to create
a wedding band for the target, with the name of the target on the ring.
`;

        if (MarriageSong.instance === undefined) {
            MarriageSong.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): MarriageSong {
        if (!MarriageSong.instance) {
            MarriageSong.instance = new MarriageSong();
        }
        return MarriageSong.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return MarriageSong.GetInstance() as T;
    }
}

export default MarriageSong;