import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Solidify implements IAbility {
    private static instance: Solidify;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Solidify";
        this.helpFile =
`solidify
A conclave only spell that solidifies the body and makes one harder to
get stunned.`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Solidify.instance === undefined) {
            Solidify.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Solidify {
        if (!Solidify.instance) {
            Solidify.instance = new Solidify();
        }
        return Solidify.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Solidify.GetInstance() as T;
    }
}

export default Solidify;