import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Courage implements IAbility {
    private static instance: Courage;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Courage";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Courage.instance === undefined) {
            Courage.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Courage {
        if (!Courage.instance) {
            Courage.instance = new Courage();
        }
        return Courage.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Courage.GetInstance() as T;
    }
}

export default Courage;