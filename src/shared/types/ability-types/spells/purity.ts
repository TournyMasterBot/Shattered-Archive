import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Purity implements IAbility {
    private static instance: Purity;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Purity";
        this.helpFile = ``;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Purity.instance === undefined) {
            Purity.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Purity {
        if (!Purity.instance) {
            Purity.instance = new Purity();
        }
        return Purity.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Purity.GetInstance() as T;
    }
}

export default Purity;