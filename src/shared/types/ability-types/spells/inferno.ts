import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Inferno implements IAbility {
    private static instance: Inferno;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Inferno";
        this.helpFile = "";
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Inferno.instance === undefined) {
            Inferno.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Inferno {
        if (!Inferno.instance) {
            Inferno.instance = new Inferno();
        }
        return Inferno.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Inferno.GetInstance() as T;
    }
}

export default Inferno;