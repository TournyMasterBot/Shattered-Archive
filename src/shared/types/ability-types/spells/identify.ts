import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Identify implements IAbility {
    private static instance: Identify;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Identify";
        this.helpFile = `
help 'Identify'
IDENTIFY
IDENTIFY
Syntax: cast identify <object>
This spell reveals information about the object.
`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Identify.instance === undefined) {
            Identify.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Identify {
        if (!Identify.instance) {
            Identify.instance = new Identify();
        }
        return Identify.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Identify.GetInstance() as T;
    }
}

export default Identify;