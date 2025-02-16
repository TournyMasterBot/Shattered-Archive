import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Chasm implements IAbility {
    private static instance: Chasm;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Chasm";
        this.helpFile = `
Chasm - The Wu Jen splits open the earth and uses the altered terrain to
their advantage, attempting to force enemy groups to break and scatter so as
to not fall into the abyss.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Chasm.instance === undefined) {
            Chasm.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Chasm {
        if (!Chasm.instance) {
            Chasm.instance = new Chasm();
        }
        return Chasm.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Chasm.GetInstance() as T;
    }
}

export default Chasm;