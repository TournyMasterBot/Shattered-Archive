import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Shadowcloak implements IAbility {
    private static instance: Shadowcloak;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Shadowcloak";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Shadowcloak.instance === undefined) {
            Shadowcloak.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Shadowcloak {
        if (!Shadowcloak.instance) {
            Shadowcloak.instance = new Shadowcloak();
        }
        return Shadowcloak.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Shadowcloak.GetInstance() as T;
    }
}

export default Shadowcloak;