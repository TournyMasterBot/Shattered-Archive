import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Climbing implements IAbility {
    private static instance: Climbing;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Climbing";
        this.helpFile = "";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.manualDescription = "";

        if (Climbing.instance === undefined) {
            Climbing.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Climbing {
        if (!Climbing.instance) {
            Climbing.instance = new Climbing();
        }
        return Climbing.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Climbing.GetInstance() as T;
    }
}

export default Climbing;