import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Runehammer implements IAbility {
    private static instance: Runehammer;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Runehammer";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;

        if (Runehammer.instance === undefined) {
            Runehammer.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Runehammer {
        if (!Runehammer.instance) {
            Runehammer.instance = new Runehammer();
        }
        return Runehammer.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Runehammer.GetInstance() as T;
    }
}

export default Runehammer;