import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Harm implements IAbility {
    private static instance: Harm;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Harm";
        this.helpFile = `
harm            a very deadly harmful spell`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Harm.instance === undefined) {
            Harm.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Harm {
        if (!Harm.instance) {
            Harm.instance = new Harm();
        }
        return Harm.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Harm.GetInstance() as T;
    }
}

export default Harm;