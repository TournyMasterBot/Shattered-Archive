import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonGryffon implements IAbility {
    private static instance: SummonGryffon;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Summon Gryffon";
        this.helpFile =
`help 'Summon Gryffon'
'SUMMON GRYFFON'
'SUMMON GRYFFON'
Syntax: cast 'summon gryffon'
This spell allows the caster to summon a powerful gryffon to aid in battle. The gryffon remains until dismissed or defeated.`;
        this.manualDescription = ``;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (SummonGryffon.instance === undefined) {
            SummonGryffon.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): SummonGryffon {
        if (!SummonGryffon.instance) {
            SummonGryffon.instance = new SummonGryffon();
        }
        return SummonGryffon.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SummonGryffon.GetInstance() as T;
    }
}

export default SummonGryffon;