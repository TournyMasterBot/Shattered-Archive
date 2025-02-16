import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class StealMagic implements IAbility {
    private static instance: StealMagic;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Steal Magic";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (StealMagic.instance === undefined) {
            StealMagic.instance = this;
        }
}

    // Method to get the single instance of the class
    public static GetInstance(): StealMagic {
        if (!StealMagic.instance) {
            StealMagic.instance = new StealMagic();
        }
        return StealMagic.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return StealMagic.GetInstance() as T;
    }
}

export default StealMagic;