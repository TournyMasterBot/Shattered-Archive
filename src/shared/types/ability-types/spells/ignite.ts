import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Ignite implements IAbility {
    private static instance: Ignite;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Ignite";
        this.helpFile = `
help wujen
Ignite - The Wu Jen conjures an overpowering heat to wash over their enemy. 
If they fail a save, they will begin stripping off their armor and throwing
it on the ground in an attempt to escape the infernal warmth.
`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Ignite.instance === undefined) {
            Ignite.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Ignite {
        if (!Ignite.instance) {
            Ignite.instance = new Ignite();
        }
        return Ignite.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Ignite.GetInstance() as T;
    }
}

export default Ignite;