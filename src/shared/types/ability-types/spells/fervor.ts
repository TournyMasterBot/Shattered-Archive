import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fervor implements IAbility {
    private static instance: Fervor;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Fervor";
        this.helpFile = `
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Fervor.instance === undefined) {
            Fervor.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Fervor {
        if (!Fervor.instance) {
            Fervor.instance = new Fervor();
        }
        return Fervor.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Fervor.GetInstance() as T;
    }
}

export default Fervor;