import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonShadow implements IAbility {
    private static instance: SummonShadow;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Summon Shadow";
        this.helpFile =
`SUMMON SHADOW
SUMMON SHADOW
syntax: cast 'summon shadow'
Your very own shadow will come to life as a powerful and mystical
protector. This spell is a favorite of the illusionists.`;
        this.manualDescription = ``;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (SummonShadow.instance === undefined) {
            SummonShadow.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): SummonShadow {
        if (!SummonShadow.instance) {
            SummonShadow.instance = new SummonShadow();
        }
        return SummonShadow.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SummonShadow.GetInstance() as T;
    }
}

export default SummonShadow;