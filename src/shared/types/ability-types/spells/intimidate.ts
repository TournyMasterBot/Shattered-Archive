import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Intimidate implements IAbility {
    private static instance: Intimidate;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Intimidate";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Intimidate.instance === undefined) {
            Intimidate.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Intimidate {
        if (!Intimidate.instance) {
            Intimidate.instance = new Intimidate();
        }
        return Intimidate.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Intimidate.GetInstance() as T;
    }
}

export default Intimidate;