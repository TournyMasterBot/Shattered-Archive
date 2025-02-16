import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateRunehammer implements IAbility {
    private static instance: CreateRunehammer;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Create Runehammer";
        this.helpFile = ""; // Add help text if needed
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CreateRunehammer.instance === undefined) {
            CreateRunehammer.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CreateRunehammer {
        if (!CreateRunehammer.instance) {
            CreateRunehammer.instance = new CreateRunehammer();
        }
        return CreateRunehammer.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CreateRunehammer.GetInstance() as T;
    }
}

export default CreateRunehammer;